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
    ops.reposts.creates
      .filter((create) => {
        if (create.record.subject.cid == appConsts.post_cid)
          console.log("repost detected")
      })

    // ops.reposts.deletes
    //   .filter(del => {
    //     console.log(del.record.subject.uri)
    //   if (del.record.subject.cid == appConsts.post_cid)
    //     console.log("at long last we have a repost to delete match")
    //   return del
    // })
    // .map(del => {
    //   return del.uri
    // })
    
    const postsToDelete = ops.posts.deletes
      .filter(del => {
        // console.log(del.uri)
        jews.forEach(element => {
          if(del.uri.includes(element))
            console.log("ayy we did it: " + del.uri)

        })
        return del
      })
      .map((del) => {
        return del.uri
      })

    const postsToCreate = ops.posts.creates
      .filter((create) => { // this is the garbage collection; drop anything unrelated 
        let isJew = jews.has(create.author) // what happens if create is null and we null check author? isJew is false? undefined? your motther???

        if (isJew) console.log("jew")

        // console.log(create.record.text)
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
          // console.log("inside creation")
          return (isJew || hashtags.includes('#jewsky') && !hashtags.includes('#private'))
      })
      .map((create) => {
        // map related posts to a db row 
        // all of these get mapped to an object id 
        // this IS WHERE THEY ARE CREATED
        console.log("inside mapping")
        console.log(create.record.text) // all posts to create log
        return {
          uri: create.uri,
          cid: create.cid,
          replyParent: create.record?.reply?.parent.uri ?? null,
          replyRoot: create.record?.reply?.root.uri ?? null,
          indexedAt: new Date().toISOString(),
        }
      })

    if (postsToDelete.length > 0) {
      // console.log(postsToDelete[0])
      await this.db
        .deleteFrom('post')
        .where('uri', 'in', postsToDelete)
        .execute()
    }
    // here is where the posts get pushed up with a db call
    if (postsToCreate.length > 0) {
      console.log("here's what is being created")
      console.log(postsToCreate[0])
      await this.db
        .insertInto('post')
        .values(postsToCreate)
        .onConflict((oc) => oc.doNothing())
        .execute()
    }
  }
}
