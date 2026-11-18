import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CirclePlus,
  ClipboardList,
  Gamepad2,
  LibraryBig,
  ListChecks,
  PencilRuler,
} from 'lucide-react';
import { LoadState } from '../components/Common.jsx';
import { PageTitle, Empty, GamesList } from '../components/Collection.jsx';
import { useLoad } from '../services/api.js';
const createLink = (
  <Link to="/host/create" className="button primary">
    <CirclePlus size={16} /> Create game
  </Link>
);
export function HostOverview({ user, library = false }) {
  const data = useLoad(library ? '/host/games' : '/host/dashboard', true);
  return (
    <>
      <PageTitle
        eyebrow="HOST STUDIO"
        title={library ? 'My games' : 'Host overview'}
        description={
          library
            ? 'Your quiz collection, from first draft to publication.'
            : `Welcome, ${user.username}. Here’s your studio at a glance.`
        }
      >
        {createLink}
      </PageTitle>
      <LoadState state={data}>
        {(d) => (
          <>
            {!library && (
              <div className="stats">
                {[
                  [LibraryBig, 'Total games', d.stats.total],
                  [ListChecks, 'Published games', d.stats.published],
                  [ClipboardList, 'Assignments', d.stats.assignments],
                ].map(([Icon, label, n]) => (
                  <div className="stat" key={label}>
                    <Icon size={19} />
                    <strong>{n}</strong>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="section-head">
              <h2>{library ? 'Game library' : 'Recent games'}</h2>
              {!library && (
                <Link className="text-button" to="/host/games">
                  View all <ArrowRight size={14} />
                </Link>
              )}
            </div>
            {(library ? d : d.games).length ? (
              <GamesList host games={library ? d : d.games} />
            ) : (
              <Empty icon={PencilRuler} title="Your studio starts here." action={createLink}>
                You haven’t created any games yet. Create your first quiz to get started.
              </Empty>
            )}
          </>
        )}
      </LoadState>
    </>
  );
}
export function MyGames({ user }) {
  const state = useLoad('/player/dashboard', true);
  return (
    <>
      <PageTitle
        eyebrow="PLAYER STUDIO"
        title="My games"
        description={`Welcome, ${user.username}. Find the quizzes your host has picked for you.`}
      />
      <div className="section-head">
        <h2>Assigned games</h2>
        <button className="text-button" onClick={state.reload}>
          Refresh
        </button>
      </div>
      <LoadState state={state}>
        {(d) =>
          d.games.length ? (
            <GamesList games={d.games} />
          ) : (
            <Empty icon={Gamepad2} title="No games assigned yet.">
              Your host will assign your first quiz. When they do, you’ll find it here.
            </Empty>
          )
        }
      </LoadState>
    </>
  );
}
