import { InvalidRequestError } from '@atproto/xrpc-server'
import { Server } from '../lexicon'
import { AppContext } from '../config'
import algos from '../algos'
import { validateAuth } from '../auth'
import { AtUri } from '@atproto/uri'

export default function (server: Server, ctx: AppContext) {
  server.app.bsky.feed.getFeedSkeleton(async ({ params, req }) => {
    const feedUri = new AtUri(params.feed)
    const algo = algos[feedUri.rkey]
    // I commented this out because Bsky had assigned to me the wrong fuckin' DID; 
    // and it was breaking it
    // maybe they can fix that shit
    // until then
    // it stays commented out 

    // if (
    //   feedUri.hostname !== ctx.cfg.publisherDid ||
    //   feedUri.collection !== 'app.bsky.feed.generator' ||
    //   !algo
    // ) {
    //   throw new InvalidRequestError(
    //     'Unsupported algorithm',
    //     'UnsupportedAlgorithm',
    //   )
    // }
    
    //  Example of how to check auth if giving user-specific results:

    // uncomment this for auth
    // const requesterDid = await validateAuth(
    //    req,
    //    ctx.cfg.serviceDid,
    //    ctx.didResolver,
    //  )
    
    // console.log(requesterDid)

    const body = await algo(ctx, params)

    // also uncomment this
    // if (requesterDid == 'did:plc:tmgpw4xfcij6tehrmo3gxyeg')
      // body.feed = []
    return {
      encoding: 'application/json',
      body: body,
    }
  })
}
