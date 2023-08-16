import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription'

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  async handleEvent(evt: RepoEvent, jews) {
    if (!isCommit(evt)) return
    const ops = await getOpsByType(evt)
    // console.log("elad suckin' a big ol dick haha jk")
    // console.log("jew count: " + jews.length)
    // This logs the text of every post off the firehose.
    // Just for fun :)
    // Delete before actually using
    // for (const post of ops.posts.creates) {
    //   console.log(post.record.text)
    // }

    const postsToDelete = ops.posts.deletes.map((del) => del.uri)
    const postsToCreate = ops.posts.creates
      .filter((create) => { // this is the garbage collection; drop anything unrelated 
        let isJew = jews.has(create.author)

        let hashtags: any[] = []
        create?.record?.text?.toLowerCase()
          ?.match(/#[^\s#\.\;]*/gmi)
          ?.map((hashtag) => {
            hashtags.push(hashtag)
          })

          return (isJew || hashtags.includes('#jewsky') && !hashtags.includes('#private'))
        // return create.record.text.toLowerCase().includes('alf')
      })
      .map((create) => {
        // map related posts to a db row 
        // all of these get mapped to an object id 
        // this IS WHERE THEY ARE CREATED
        console.log(create.record.text)
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
