import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription'
import * as appConsts from '../src/util/app-consts' 

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  async handleEvent(evt: RepoEvent, jews) {
    if (!isCommit(evt)) return
    const ops = await getOpsByType(evt)
    // for (const post of ops.posts.creates) {
    //   console.log(post.record.text)
    // }
    const repostsUsersToAdd = ops.reposts.creates
      .filter((create) => {
        // console.log("registering that a repost event has occurred")
        if (create?.cid == appConsts.post_cid) {
          console.log("found the jewsky repost has been reposted")
          console.log("author did is: " + create.author)
          console.log("author exists in list already:"+ jews.has(create.author))
          if (!jews.has(create.author))
            jews.push(create.author)
        }
      })
    const postsToDelete = ops.posts.deletes.map((del) => del.uri)
    const postsToCreate = ops.posts.creates
      .filter((create) => { // this is the garbage collection; drop anything unrelated 
        let isJew = jews.has(create.author) // what happens if create is null and we null check author? isJew is false? undefined? your motther???
        // // TEMP FIX to see if we can add people into the new list dynamically instead of at app start; we still need to account for un-reposts (ugh)
        // if (create?.cid == appConsts.post_cid) {
        //   var repostedBy = ops.reposts.creates
        //   jews.push(create.author)
        // }
        let hashtags: any[] = []
        create?.record?.text?.toLowerCase()
          ?.match(/#[^\s#\.\;]*/gmi)
          ?.map((hashtag) => {
            hashtags.push(hashtag)
          })

          return (isJew || hashtags.includes('#jewsky') && !hashtags.includes('#private'))
      })
      .map((create) => {
        // map related posts to a db row 
        // all of these get mapped to an object id 
        // this IS WHERE THEY ARE CREATED
        // console.log(create.record.text) // all posts to create log
        return {
          uri: create.uri,
          cid: create.cid,
          replyParent: create.record?.reply?.parent.uri ?? null,
          replyRoot: create.record?.reply?.root.uri ?? null,
          indexedAt: new Date().toISOString(),
        }
      })

    if (postsToDelete.length > 0) {
      await this.db
        .deleteFrom('post')
        .where('uri', 'in', postsToDelete)
        .execute()
    }
    // here is where the posts get pushed up with a db call
    if (postsToCreate.length > 0) {
      console.log(postsToCreate[0])
      await this.db
        .insertInto('post')
        .values(postsToCreate)
        .onConflict((oc) => oc.doNothing())
        .execute()
    }
  }
}
