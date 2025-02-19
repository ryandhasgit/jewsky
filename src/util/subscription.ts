import { Subscription } from '@atproto/xrpc-server' // what is this package?
import { cborToLexRecord, readCar } from '@atproto/repo'
import { BlobRef } from '@atproto/lexicon'
import { ids, lexicons } from '../lexicon/lexicons'
import { Record as PostRecord } from '../lexicon/types/app/bsky/feed/post'
import { Record as RepostRecord } from '../lexicon/types/app/bsky/feed/repost'
import { Record as LikeRecord } from '../lexicon/types/app/bsky/feed/like'
import { Record as FollowRecord } from '../lexicon/types/app/bsky/graph/follow'
import {
  Commit,
  OutputSchema as RepoEvent,
  isCommit,
} from '../lexicon/types/com/atproto/sync/subscribeRepos'
import { Database } from '../db'
import { AtpAgent } from '@atproto/api'
import * as appConsts from '../util/app-consts'
import crypto from 'node:crypto'
import { decrypt } from 'dotenv'


function parseReposts(repostsData) {
  // move jew logic into here
}

function decryptDID(encryptedDid) {
  let algorithm = process.env.ENCRYPTION_ALG!
  let pw = process.env.ENCRYPTION_KEY!
  const key = crypto.scryptSync(pw, 'salt', 32)
  const iv = Buffer.alloc(16, 0)
  const decipher = crypto.createDecipheriv(algorithm, key, iv)
  let decryptedDid = decipher.update(encryptedDid, 'hex', 'utf8')
  decryptedDid += decipher.final('utf8')
  return decryptedDid
}

export abstract class FirehoseSubscriptionBase {
  public sub: Subscription<RepoEvent>

  constructor(public db: Database, public service: string) {
    this.sub = new Subscription({
      service: service,
      method: ids.ComAtprotoSyncSubscribeRepos,
      getParams: () => this.getCursor(),
      validate: (value: unknown) => {
        try {
          return lexicons.assertValidXrpcMessage<RepoEvent>(
            ids.ComAtprotoSyncSubscribeRepos,
            value,
          )
        } catch (err) {
          console.error('repo subscription skipped invalid message', err)
        }
      },
    })
  }

  abstract handleEvent(evt: RepoEvent, jews): Promise<void>

  async run(subscriptionReconnectDelay: number) {
    console.log("fart bucket"); // is reached on app start
    try {
      console.log("attempting to instantiate AtpAgent")
      const agent = new AtpAgent({ service: 'https://bsky.social' })
      const uri = appConsts.post_uri;
      console.log("attempting to call api")
      await agent.login({ identifier: process.env.HANDLE ?? '', password: process.env.PASSWORD ?? '' })

      console.log("getting first repost data")
      let repostData = await agent.api.app.bsky.feed.getRepostedBy({ uri, limit: 70 })
      let repostedBy = repostData.data.repostedBy;

      console.log("repostedBys length: " + repostedBy.length)
      let cursor = repostData.data.cursor;
      console.log("Cursor is null:" + cursor == null + '\n')
      while (cursor != null) {
        console.log("cursor loop, getting newReposts")
        let newReposts = await agent.api.app.bsky.feed.getRepostedBy({ uri, limit: 70, cursor: cursor })
        console.log("new reposts length:" + newReposts.data.repostedBy.length + "\n")
        repostedBy.push(...newReposts.data.repostedBy)
        console.log("running list of reposts: " + repostedBy.length)
        cursor = newReposts.data.cursor
      }

      // get bad actors (this won't work for entries over 100, but if we get to that point we'll have bigger problems than this first)
      // typescript sucks so i just made it a POJO with "any" since the stupid thing didn't recognize the object correctly
      let feed = await agent.app.bsky.feed.getAuthorFeed({ actor: appConsts.removal_did })
      let decryptedDids = new Set(feed.data.feed.map((post) => {
        let postText: any = post.post.record;
        return decryptDID(postText.text)
      }))

      console.log("repostedBy: " + repostedBy.length)
      // map the jews without the putzes
      let jews = new Set(repostedBy
        .filter(poster => {
          return !decryptedDids.has(poster.did)
        })
        .map(poster => {
          return poster.did
        }))

      console.log("jews: " + jews.size)

      // this loop may be called every time this.sub is updated
      // or when we saw everyting coming in its because maybe 1000 instances a second were coming in
      for await (const evt of this.sub) { // this is hit any time there is a post!
        try {
          await this.handleEvent(evt, jews)
        } catch (err) {
          console.error('repo subscription could not handle message', err)
        }
        // update stored cursor every 20 events or so
        // dev note: what is stored cursor???
        if (isCommit(evt) && evt.seq % 20 === 0) {
          await this.updateCursor(evt.seq)
        }
      }
    } catch (err) {
      console.error('repo subscription errored', err)
      setTimeout(() => this.run(subscriptionReconnectDelay), subscriptionReconnectDelay)
    }

  }

  // this updates list of posts subscribed to the alg????
  async updateCursor(cursor: number) {
    await this.db
      .updateTable('sub_state')
      .set({ cursor })
      .where('service', '=', this.service)
      .execute()
  }

  async getCursor(): Promise<{ cursor?: number }> {
    const res = await this.db
      .selectFrom('sub_state')
      .selectAll()
      .where('service', '=', this.service)
      .executeTakeFirst()
    return res ? { cursor: res.cursor } : {}
  }
}

export const getOpsByType = async (evt: Commit): Promise<OperationsByType> => {
  const car = await readCar(evt.blocks)
  const opsByType: OperationsByType = {
    posts: { creates: [], deletes: [] },
    reposts: { creates: [], deletes: [] },
    likes: { creates: [], deletes: [] },
    follows: { creates: [], deletes: [] },
  }

  for (const op of evt.ops) {
    const uri = `at://${evt.repo}/${op.path}`
    const [collection] = op.path.split('/')
    if (op.action === 'update') continue // updates not supported yet

    if (op.action === 'create') {
      if (!op.cid) continue
      const recordBytes = car.blocks.get(op.cid)
      if (!recordBytes) continue
      const record = cborToLexRecord(recordBytes)
      const create = { uri, cid: op.cid.toString(), author: evt.repo }
      if (collection === ids.AppBskyFeedPost && isPost(record)) {
        opsByType.posts.creates.push({ record, ...create })
      } else if (collection === ids.AppBskyFeedRepost && isRepost(record)) {
        opsByType.reposts.creates.push({ record, ...create })
      } else if (collection === ids.AppBskyFeedLike && isLike(record)) {
        opsByType.likes.creates.push({ record, ...create })
      } else if (collection === ids.AppBskyGraphFollow && isFollow(record)) {
        opsByType.follows.creates.push({ record, ...create })
      }
    }

    if (op.action === 'delete') {
      if (collection === ids.AppBskyFeedPost) {
        opsByType.posts.deletes.push({ uri })
      } else if (collection === ids.AppBskyFeedRepost) {
        opsByType.reposts.deletes.push({ uri })
      } else if (collection === ids.AppBskyFeedLike) {
        opsByType.likes.deletes.push({ uri })
      } else if (collection === ids.AppBskyGraphFollow) {
        opsByType.follows.deletes.push({ uri })
      }
    }
  }

  return opsByType
}

type OperationsByType = {
  posts: Operations<PostRecord>
  reposts: Operations<RepostRecord>
  likes: Operations<LikeRecord>
  follows: Operations<FollowRecord>
}

type Operations<T = Record<string, unknown>> = {
  creates: CreateOp<T>[]
  deletes: DeleteOp[]
}

type CreateOp<T> = {
  uri: string
  cid: string
  author: string
  record: T
}

type DeleteOp = {
  uri: string
}

export const isPost = (obj: unknown): obj is PostRecord => {
  return isType(obj, ids.AppBskyFeedPost)
}

export const isRepost = (obj: unknown): obj is RepostRecord => {
  return isType(obj, ids.AppBskyFeedRepost)
}

export const isLike = (obj: unknown): obj is LikeRecord => {
  return isType(obj, ids.AppBskyFeedLike)
}

export const isFollow = (obj: unknown): obj is FollowRecord => {
  return isType(obj, ids.AppBskyGraphFollow)
}

const isType = (obj: unknown, nsid: string) => {
  try {
    lexicons.assertValidRecord(nsid, fixBlobRefs(obj))
    return true
  } catch (err) {
    return false
  }
}

// @TODO right now record validation fails on BlobRefs
// simply because multiple packages have their own copy
// of the BlobRef class, causing instanceof checks to fail.
// This is a temporary solution.
const fixBlobRefs = (obj: unknown): unknown => {
  if (Array.isArray(obj)) {
    return obj.map(fixBlobRefs)
  }
  if (obj && typeof obj === 'object') {
    if (obj.constructor.name === 'BlobRef') {
      const blob = obj as BlobRef
      return new BlobRef(blob.ref, blob.mimeType, blob.size, blob.original)
    }
    return Object.entries(obj).reduce((acc, [key, val]) => {
      return Object.assign(acc, { [key]: fixBlobRefs(val) })
    }, {} as Record<string, unknown>)
  }
  return obj
}
