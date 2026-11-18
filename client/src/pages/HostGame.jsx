import { useState } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  CirclePlus,
  Pencil,
  Save,
  Send,
  Trash2,
  UsersRound,
  X,
} from 'lucide-react';
import { api, post, useAction, useLoad } from '../services/api.js';
import { Field, LoadState, Modal, Notice } from '../components/Common.jsx';
import { Badge, PageTitle } from '../components/Collection.jsx';
const blank = () => ({
  key: crypto.getRandomValues(new Uint32Array(2)).join('-'),
  text: '',
  points: 10,
  options: ['', ''],
  correctIndex: 0,
});
const letter = (i) => String.fromCharCode(65 + i);
export function GameEditor({ edit = false }) {
  const { gameId } = useParams(),
    state = useLoad(edit ? `/host/games/${gameId}` : null);
  return edit ? (
    <LoadState state={state}>
      {(g) =>
        g.status === 'DRAFT' ? (
          <Editor key={g.id} game={g} />
        ) : (
          <Notice>Published games cannot be edited.</Notice>
        )
      }
    </LoadState>
  ) : (
    <Editor key="new" />
  );
}
function Editor({ game }) {
  const navigate = useNavigate(),
    action = useAction();
  const [title, setTitle] = useState(game?.title ?? ''),
    [description, setDescription] = useState(game?.description ?? '');
  const [questions, setQuestions] = useState(() =>
    game
      ? game.questions.map((q) => ({
          key: q.id,
          text: q.text,
          points: q.points,
          options: q.options.map((o) => o.text),
          correctIndex: q.options.findIndex((o) => o.isCorrect),
        }))
      : [blank()],
  );
  const change = (index, props) =>
    setQuestions((qs) => qs.map((q, i) => (i === index ? { ...q, ...props } : q)));
  const move = (i, dir) =>
    setQuestions((qs) => {
      const arr = [...qs];
      [arr[i], arr[i + dir]] = [arr[i + dir], arr[i]];
      return arr;
    });
  const save = (e) => {
    e.preventDefault();
    const status = e.nativeEvent.submitter?.value === 'publish' ? 'PUBLISHED' : 'DRAFT';
    action.run(async () => {
      const data = {
        title,
        description,
        status,
        questions: questions.map(({ key, ...q }) => ({ ...q, points: Number(q.points) })),
        ...(game ? { revision: game.revision } : {}),
      };
      const result = await api(game ? `/host/games/${game.id}` : '/host/games', {
        method: game ? 'PATCH' : 'POST',
        body: data,
      });
      navigate(`/host/games/${result.id}`, {
        replace: true,
        state: {
          notice:
            status === 'PUBLISHED'
              ? 'Game published. Choose players to assign it to.'
              : 'Draft saved.',
        },
      });
    });
  };
  return (
    <>
      <Link to="/host/games" className="back-link">
        <ArrowLeft size={15} /> My games
      </Link>
      <PageTitle
        eyebrow="QUIZ BUILDER"
        title={game ? 'Edit draft' : 'Create a game'}
        description="Build your quiz, then publish it when it’s ready to share."
      />
      <form onSubmit={save}>
        <section className="sheet">
          <h2>Game details</h2>
          <div className="stack-form">
            <Field
              label="Game title"
              required
              maxLength={120}
              placeholder="Give your quiz a name"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <label className="field">
              <span className="label">Instructions (optional)</span>
              <textarea
                rows={3}
                maxLength={2000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What should your players know?"
              />
            </label>
          </div>
        </section>
        <div className="section-head">
          <h2>Questions</h2>
          <span className="micro">{questions.length} / 50</span>
        </div>
        {questions.map((q, i) => (
          <section className="sheet editor-question" key={q.key}>
            <div className="row-between">
              <h3>Question {i + 1}</h3>
              <div className="mini-actions">
                <button
                  className="icon-button"
                  type="button"
                  disabled={!i}
                  aria-label={`Move question ${i + 1} up`}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  disabled={i === questions.length - 1}
                  aria-label={`Move question ${i + 1} down`}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove question ${i + 1}`}
                  onClick={() => setQuestions(questions.filter((_, n) => n !== i))}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            <div className="stack-form">
              <label className="field">
                <span className="label">Question text</span>
                <textarea
                  rows={2}
                  required
                  maxLength={1000}
                  value={q.text}
                  onChange={(e) => change(i, { text: e.target.value })}
                />
              </label>
              <fieldset className="options">
                <legend>Answer options</legend>
                <p className="hint">Select the circle next to the correct answer.</p>
                {q.options.map((val, j) => (
                  <div className="edit-option" key={j}>
                    <input
                      type="radio"
                      name={`correct-${q.key}`}
                      aria-label={`Mark option ${letter(j)} correct`}
                      checked={q.correctIndex === j}
                      onChange={() => change(i, { correctIndex: j })}
                    />
                    <input
                      aria-label={`Option ${letter(j)}`}
                      required
                      maxLength={300}
                      value={val}
                      placeholder={`Option ${letter(j)}`}
                      onChange={(e) =>
                        change(i, {
                          options: q.options.map((v, n) => (n === j ? e.target.value : v)),
                        })
                      }
                    />
                    {q.options.length > 2 && (
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={`Remove option ${letter(j)}`}
                        onClick={() =>
                          change(i, {
                            options: q.options.filter((_, n) => n !== j),
                            correctIndex:
                              q.correctIndex === j
                                ? 0
                                : q.correctIndex > j
                                  ? q.correctIndex - 1
                                  : q.correctIndex,
                          })
                        }
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                ))}
                {q.options.length < 4 && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => change(i, { options: [...q.options, ''] })}
                  >
                    <CirclePlus size={15} /> Add option
                  </button>
                )}
              </fieldset>
              <div className="points-field">
                <Field
                  label="Points"
                  type="number"
                  min="1"
                  max="100"
                  required
                  value={q.points}
                  onChange={(e) => change(i, { points: e.target.value })}
                />
              </div>
            </div>
          </section>
        ))}
        <button
          type="button"
          className="add-question"
          disabled={questions.length >= 50}
          onClick={() => setQuestions([...questions, blank()])}
        >
          <CirclePlus size={18} /> Add question
        </button>
        <Notice>{action.error}</Notice>
        <div className="form-actions">
          <button className="button secondary" type="submit" value="draft" disabled={action.busy}>
            <Save size={16} />
            Save draft
          </button>
          <button
            className="button primary"
            type="submit"
            value="publish"
            disabled={action.busy || !questions.length}
          >
            <Send size={16} />
            Publish game
          </button>
        </div>
      </form>
    </>
  );
}
export function HostGame() {
  const { gameId } = useParams(),
    state = useLoad(`/host/games/${gameId}`),
    action = useAction(),
    navigate = useNavigate();
  const { state: locationState } = useLocation();
  const [notice, setNotice] = useState(locationState?.notice ?? ''),
    [confirm, setConfirm] = useState(false);
  const publish = (g, verb) =>
    action.run(async () => {
      await post(`/host/games/${gameId}/${verb}`, { revision: g.revision });
      setNotice(verb === 'publish' ? 'Game published.' : 'Game returned to drafts.');
      state.reload();
    });
  return (
    <>
      <Link to="/host/games" className="back-link">
        <ArrowLeft size={15} /> My games
      </Link>
      <LoadState state={state}>
        {(g) => (
          <>
            <PageTitle eyebrow="GAME DETAILS" title={g.title}>
              <Badge value={g.status} />
            </PageTitle>
            <Notice success>{notice}</Notice>
            <Notice>{action.error}</Notice>
            <section className="sheet">
              <h2>Instructions</h2>
              <p className="muted pre-line">{g.description || 'No additional instructions.'}</p>
              <div className="action-row">
                {g.status === 'DRAFT' ? (
                  <>
                    <Link className="button secondary" to="edit">
                      <Pencil size={15} />
                      Edit draft
                    </Link>
                    <button
                      className="button primary"
                      onClick={() => publish(g, 'publish')}
                      disabled={action.busy}
                    >
                      Publish game
                    </button>
                    <button
                      className="text-button danger"
                      onClick={() => setConfirm(true)}
                      disabled={action.busy}
                    >
                      Delete draft
                    </button>
                  </>
                ) : (
                  <>
                    <Link className="button primary" to="assign">
                      <UsersRound size={16} />
                      Manage assignments
                    </Link>
                    <button
                      className="button secondary"
                      disabled={action.busy || g.assignedCount > 0}
                      onClick={() => publish(g, 'unpublish')}
                    >
                      Unpublish
                    </button>
                  </>
                )}
              </div>
              {g.assignedCount > 0 && (
                <p className="hint">
                  Assigned to {g.assignedCount} player(s). Assigned games are locked to preserve
                  results.
                </p>
              )}
            </section>
            <div className="section-head">
              <h2>Question preview</h2>
              <span className="micro">{g.questions.length} QUESTIONS</span>
            </div>
            {!g.questions.length && <p className="muted">Add a question to publish this draft.</p>}
            {g.questions.map((q, i) => (
              <section className="sheet" key={q.id}>
                <div className="row-between">
                  <span className="micro">QUESTION {i + 1}</span>
                  <span className="badge">{q.points} pts</span>
                </div>
                <h3 className="question-text">{q.text}</h3>
                <div className="preview-options">
                  {q.options.map((o, j) => (
                    <div key={o.id} className={o.isCorrect ? 'correct' : ''}>
                      <span className="option-letter">{letter(j)}</span>
                      <span>{o.text}</span>
                      {o.isCorrect && <Check size={16} aria-label="Correct option" />}
                    </div>
                  ))}
                </div>
              </section>
            ))}
            {confirm && (
              <Modal
                title="Delete this draft?"
                eyebrow="CONFIRM DELETION"
                onClose={() => setConfirm(false)}
              >
                <p className="muted">“{g.title}” and its questions will be permanently removed.</p>
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
                        await api(`/host/games/${gameId}`, {
                          method: 'DELETE',
                          body: { revision: g.revision },
                        });
                        navigate('/host/games');
                      });
                    }}
                  >
                    Delete draft
                  </button>
                </div>
              </Modal>
            )}
          </>
        )}
      </LoadState>
    </>
  );
}
