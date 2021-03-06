/**
 *
 * This action will take an inbound message (that was not generated by this app)
 * and return a response message if the content matches specific criteria.
 *
 * The inbound params should contain the following properties:
 * myEvent - Bool - Was the message generated by this app. Use this to avoid message loops
 * spaceId - string - the space that the message originated from
 * content - string - the content of the message
 *
 * The results are intended to be input for the WWSendMessage action:
 * spaceId - string - the target space for the new message
 * title - string - the title used for the new message
 * text: - string - the text for the new message
 *
 */

function main(params) {
  if (params.hasOwnProperty("content") &&
    params.content.toLowerCase().startsWith("can you echo") &&
    params.hasOwnProperty("spaceId")) {
    return {
      spaceId: params.spaceId,
      title: "From Echo Bot",
      text: "Why yes I can!"
    }
  } else {
    return Promise.reject({
      status: "nothing to see here"
    })
  }
}
