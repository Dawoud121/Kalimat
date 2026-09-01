// v2.8.1
import { useSearchParams } from 'react-router-dom'
import WordBank from './WordBank'
import CommunityDecks from './CommunityDecks'

const COMMUNITY_SECTIONS = { team: 'team', browse: 'browse', uploads: 'mine' }

export default function Decks() {
  const [searchParams] = useSearchParams()
  const section = searchParams.get('section') || 'my-decks'

  if (COMMUNITY_SECTIONS[section]) {
    return <CommunityDecks forceSection={COMMUNITY_SECTIONS[section]} />
  }

  return <WordBank forceSection="decks" />
}
