import SqliteDb from 'better-sqlite3'
import { Kysely, Migrator, SqliteDialect, PostgresDialect, FileMigrationProvider } from 'kysely'
import { Pool } from 'pg'
import * as path from 'path'
import { promises as fs } from 'fs'
import { DatabaseSchema } from './schema'
import { migrationProvider } from './migrations'

// export const createDb = (location: string): Database => {
//   return new Kysely<DatabaseSchema>({
//     dialect: new SqliteDialect({
//       database: new SqliteDb(location), // this is an in-memory db, not persistent
//     }),
//   })
// }
const dialect = new PostgresDialect({
  pool: new Pool({
    database: 'test',
    host: 'localhost',
    user: 'postgres',
    password: 'hellyeahbro',
    port: 5432,
    max: 10,
  })
})

export const createDb = (location: string): Database => {
  return new Kysely<DatabaseSchema>({
    dialect: dialect,
  })
}

// export async function migrateToLatest() {
//   const db = new Kysely<Database>({
//     dialect: new PostgresDialect({
//       pool: new Pool({
//         host: 'localhost',
//         database: 'test',
//         user: 'postgres',
//         password: 'hellyeahbro',
//       }),
//     }),
//   })

//   const migrator = new Migrator({
//     db,
//     provider: new FileMigrationProvider({
//       fs,
//       path,
//       // This needs to be an absolute path.
//       migrationFolder: path.join(__dirname, './'),
//     }),
//   })

//   const { error, results } = await migrator.migrateToLatest()

//   results?.forEach((it) => {
//     if (it.status === 'Success') {
//       console.log(`migration "${it.migrationName}" was executed successfully`)
//     } else if (it.status === 'Error') {
//       console.error(`failed to execute migration "${it.migrationName}"`)
//     }
//   })

//   if (error) {
//     console.error('failed to migrate')
//     console.error(error)
//     process.exit(1)
//   }

//   await db.destroy()
// }

// sqlite migrator
// export const migrateToLatest = async (db: Database) => {
//   const migrator = new Migrator({ db, provider: migrationProvider })
//   const { error } = await migrator.migrateToLatest()
//   if (error) throw error
// }

export type Database = Kysely<DatabaseSchema> // kysely is the sqllite db wrapper
