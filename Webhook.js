/*
 * This is a Webhook End-point for Watson Workspace. You will need to modify the credentials below
 * to contain the actual credentials for your Watson Workspace App.
 *
 * This action will perform all the necesary validation and hand-shaking to Watson Work Services.
 * Actual events will be published on the EventTrigger trigger
 * The following package parameters are used:
 * WWAppId - The Watson Workspace appId
 * WWAppSecret - The Watson Workspace App AppSecret
 * WWWebhookSecret - The Watson Workspace Webhook Secret
 * WWEventTopic - The name of the topic to send events to
 */

var crypto = require("crypto");
var openwhisk = require("openwhisk");
var util = require("util");
var _ = require("lodash");
var mustache = require("mustache");
var annotationGQL = {
	GraphQLExpansion: `
   query {
     message(id: "{{messageId}}") {
       content
       id
       created
       createdBy {
         displayName
         id
         emailAddresses
         photoUrl
       }
     }
   }`
};

var expansion = {
	"message-annotation-added": annotationGQL,
	"message-annotation-edited": annotationGQL,
	"message-annotation-removed": annotationGQL,
};

function expandEvent(body, params, ow) {
	return new Promise((resolve, reject) => {

		// expand annotationPayload into JSON obejct if it exists.
		if (body.hasOwnProperty("annotationPayload") && typeof body.annotationPayload === "string")
			body.annotationPayload = JSON.parse(body.annotationPayload);

		// Was this event generated by my app?
			body.myEvent = body.userId === params.AppInfo.AppId;

		// Check to see if there is an expansion GraphQL expression to run
		if (body.hasOwnProperty("type") && expansion.hasOwnProperty(body.type)) {
			var exp = expansion[body.type];
			ow.actions.invoke({
				name: "WatsonWorkspace/WWGraphQL",
				blocking: true,
				params: {
					string: mustache.render(exp.GraphQLExpansion, body)
				}
			}).then(resp => {
				// If annotation, mark it as generated by my app if it was
				if (body.type.startsWith("message-annotation"))
					body.myEvent = resp.response.result.data.message.createdBy.id === params.AppInfo.AppId;

				var data = body;
				if (exp.hasOwnProperty("asProperty")) {
					data[exp.asProperty] = resp.response.result.data;
				} else {
					data = _.merge(data, resp.response.result.data);
				}
				resolve(data);
			}).catch(err => {
				reject(err);
			});
		} else {
			resolve(body);
		}
	});
}

function main(params) {
	return new Promise((resolve, reject) => {
		var ow = openwhisk();
		var req = {
			rawBody: Buffer.from(params.__ow_body, "base64").toString(),
			body: JSON.parse(Buffer.from(params.__ow_body, "base64").toString()),
			headers: params.__ow_headers
		};
		if (!validateSender(params, req)) {
			reject({
				statusCode: 401,
				body: "Invalid Request Signature"
			});
		}
		if (req.body.hasOwnProperty("type") && req.body.type === "verification") {
			var body = {
				response: req.body.challenge
			};
			var strBody = JSON.stringify(body);
			var validationToken = crypto.createHmac("sha256", params.WatsonWorkspace.AppInfo.WebhookSecret).update(strBody).digest("hex");
			resolve({
				statusCode: 200,
				headers: {
					"Content-Type": "text/plain; charset=utf-8",
					"X-OUTBOUND-TOKEN": validationToken
				},
				body: strBody
			});
		} else {

			// Cleanup time field
			if (req.body.hasOwnProperty("time"))
				req.body.time = Date(req.body.time).toString();

			// Expand Event
			expandEvent(req.body, params.WatsonWorkspace, ow).then(body => {

				// Send event to topic
				ow.triggers.invoke({
					name: params.WatsonWorkspace.EventTrigger,
					params: body
				}).then(result => {
					resolve({
						statusCode: 200,
						headers: {
							"Content-Type": "application/json"
						},
						body: {
							status: "OK!"
						}
					});
				}).catch(err => {
					reject({
						statusCode: 401,
						message: "Error firing trigger",
						error: err
					});
				});
			}).catch(err => {
				reject({
					statusCode: 401,
					message: "Error expanding event",
          error: err
				});
			});
		}
	});
}


function validateSender(params, req) {
	var ob_token = req.headers["x-outbound-token"];
	var calculated = crypto.createHmac("sha256", params.WatsonWorkspace.AppInfo.WebhookSecret).update(req.rawBody).digest("hex");
	return ob_token == calculated;
}