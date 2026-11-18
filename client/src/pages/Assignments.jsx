import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Search, UsersRound } from 'lucide-react';
import { post, useAction, useLoad } from '../services/api.js';
import { Badge, Empty, PageTitle } from '../components/Collection.jsx';
import { Field, LoadState, Modal, Notice } from '../components/Common.jsx';
export function Players() {
  const state = useLoad('/host/players', true),
    [filter, setFilter] = useState('');
  return (
    <>
      <PageTitle
        eyebrow="HOST STUDIO"
        title="Players"
        description="Your player directory and first-login activation status."
      />
      <div className="directory-search">
        <Field
          label="Find a player"
          icon={Search}
          placeholder="Search by username"
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <LoadState state={state}>
        {(list) => (
          <div className="item-list">
            {list
              .filter((p) => p.username.includes(filter.trim().toLowerCase()))
              .map((p) => (
                <div className="list-item" key={p.id}>
                  <div className="avatar">{p.username.slice(0, 2).toUpperCase()}</div>
                  <div className="list-copy">
                    <h3>{p.username}</h3>
                    <p>{p.active ? 'Player account' : 'Inactive account'}</p>
                  </div>
                  <Badge value={p.activated ? 'ACTIVE' : 'PENDING'} />
                </div>
              ))}
            {!list.some((p) => p.username.includes(filter.trim().toLowerCase())) && (
              <Empty icon={UsersRound} title="No players found.">
                Try another username.
              </Empty>
            )}
          </div>
        )}
      </LoadState>
    </>
  );
}
export function Assignments() {
  const { gameId } = useParams(),
    people = useLoad('/host/players'),
    current = useLoad(`/host/games/${gameId}/assignments`, true);
  const [selection, setSelection] = useState([]),
    [confirm, setConfirm] = useState(false),
    [message, setMessage] = useState(''),
    action = useAction();
  return (
    <>
      <Link to={`/host/games/${gameId}`} className="back-link">
        <ArrowLeft size={14} /> Game details
      </Link>
      <LoadState state={current}>
        {({ game, assignments }) => (
          <>
            <PageTitle eyebrow="GAME ASSIGNMENTS" title="Assign players" description={game.title} />
            <Notice success>{message}</Notice>
            <Notice>{action.error}</Notice>
            <LoadState state={people}>
              {(players) => {
                const available = players.filter(
                  (p) => p.active && !assignments.some((a) => a.playerId === p.id),
                );
                const ids = selection.filter((id) => available.some((p) => p.id === id));
                return (
                  <>
                    <section className="sheet">
                      <div className="row-between">
                        <h2>Select players</h2>
                        <span className="micro">{ids.length} SELECTED</span>
                      </div>
                      <p className="muted">
                        Players can open this quiz after activation. Each player can submit once.
                      </p>
                      <div className="player-picks">
                        {available.map((p) => (
                          <label key={p.id}>
                            <input
                              type="checkbox"
                              checked={ids.includes(p.id)}
                              disabled={game.status !== 'PUBLISHED'}
                              onChange={(e) =>
                                setSelection(
                                  e.target.checked
                                    ? [...ids, p.id]
                                    : ids.filter((id) => id !== p.id),
                                )
                              }
                            />
                            <span>{p.username}</span>
                          </label>
                        ))}
                      </div>
                      {!available.length && (
                        <p className="muted">All eligible players have been assigned.</p>
                      )}
                      <button
                        className="button primary"
                        disabled={!ids.length || action.busy || game.status !== 'PUBLISHED'}
                        onClick={() => setConfirm(true)}
                      >
                        Assign selected ({ids.length})
                      </button>
                    </section>
                    <div className="section-head">
                      <h2>Assigned players</h2>
                      <span className="micro">{assignments.length} TOTAL</span>
                    </div>
                    {assignments.length ? (
                      <div className="item-list">
                        {assignments.map((a) => (
                          <div className="list-item" key={a.playerId}>
                            <div className="list-copy">
                              <h3>{a.username}</h3>
                            </div>
                            <Badge value={a.progress} />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Empty icon={UsersRound} title="No assignments yet.">
                        Choose the players who should receive this game.
                      </Empty>
                    )}
                    {confirm && (
                      <Modal
                        title="Confirm assignment"
                        eyebrow="GAME ASSIGNMENTS"
                        onClose={() => setConfirm(false)}
                      >
                        <p className="muted">
                          Assign “{game.title}” to {ids.length} selected player(s)? Once assigned,
                          the game stays published to protect their results.
                        </p>
                        <div className="modal-actions">
                          <button className="button secondary" onClick={() => setConfirm(false)}>
                            Cancel
                          </button>
                          <button
                            className="button primary"
                            disabled={action.busy}
                            onClick={() => {
                              setConfirm(false);
                              action.run(async () => {
                                const r = await post(`/host/games/${gameId}/assignments`, {
                                  playerIds: ids,
                                });
                                setSelection([]);
                                setMessage(
                                  r.added
                                    ? `Assigned to ${r.added} player(s).`
                                    : 'Those players already have this game.',
                                );
                                current.reload();
                              });
                            }}
                          >
                            Confirm assignment
                          </button>
                        </div>
                      </Modal>
                    )}
                  </>
                );
              }}
            </LoadState>
          </>
        )}
      </LoadState>
    </>
  );
}
