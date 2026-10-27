// Turns #topics and @usernames in captions/comments into links.
import { Fragment } from 'react'
import { Link } from 'react-router'

const TOKEN = /(#[a-z0-9_]+|@[a-z0-9_.]{3,30})/gi

export default function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(TOKEN).map((part, i) => {
        if (/^#[a-z0-9_]+$/i.test(part)) return <Link key={i} to={`/t/${part.slice(1).toLowerCase()}`} className="text-sky-700 hover:underline">{part}</Link>
        if (/^@[a-z0-9_.]{3,30}$/i.test(part)) return <Link key={i} to={`/u/${part.slice(1).toLowerCase().replace(/\.$/, '')}`} className="text-sky-700 hover:underline">{part}</Link>
        return <Fragment key={i}>{part}</Fragment>
      })}
    </>
  )
}
