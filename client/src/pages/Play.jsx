import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle2,
  Play,
  Send,
  Trophy,
} from 'lucide-react';
import { LoadState, Modal, Notice } from '../components/Common.jsx';
import { Badge, Empty, PageTitle } from '../components/Collection.jsx';
import { post, useAction, useLoad } from '../services/api.js';
const date = (value) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
export function PlayGame() {
  const { gameId } = useParams(),
    state = useLoad(`/player/games/${gameId}`),
    action = useAction();
  return (
    <>
      <Link className="back-link" to="/player">
        <ArrowLeft size={15} /> My games
      </Link>
      <LoadState state={state}>
        {(g) => (
          <>
            <PageTitle
              eyebrow="PLAYER STUDIO"
              title={g.title}
              description={`Assigned by ${g.hostName}`}
            >
              <Badge value={g.progress} />
            </PageTitle>
            <section className="sheet">
              <h2>Instructions</h2>
              <p className="muted pre-line">
                {g.description ||
                  'Choose one answer for each question. You can submit this quiz once.'}
              </p>
              <div className="quiz-facts">
                <span>
                  <BookOpen size={15} />
                  {g.questionCount} {g.questionCount === 1 ? 'question' : 'questions'}
                </span>
                <span>
                  <Award size={15} />
                  {g.maxScore} points
                </span>
                <span>
                  <CheckCircle2 size={15} />
                  One submission
                </span>
              </div>
              {g.progress === 'ASSIGNED' && (
                <button
                  className="button primary"
                  disabled={action.busy}
                  onClick={() =>
                    action.run(async () => {
                      await post(`/player/games/${gameId}/attempts`);
                      state.reload();
                    })
                  }
                >
                  <Play size={15} />
                  {action.busy ? 'Starting…' : 'Start game'}
                </button>
              )}
              {g.progress === 'SUBMITTED' && (
                <Link className="button primary" to={`/player/results/${g.attemptId}`}>
                  View my result <ArrowRight size={15} />
                </Link>
              )}
              <Notice>{action.error}</Notice>
            </section>
            {g.progress === 'STARTED' && <Quiz key={g.attemptId} game={g} reload={state.reload} />}
          </>
        )}
      </LoadState>
    </>
  );
}
function Quiz({ game, reload }) {
  const [answers, setAnswers] = useState({}),
    [confirm, setConfirm] = useState(false),
    action = useAction(),
    navigate = useNavigate(),
    count = Object.keys(answers).length;
  const finish = () => {
    setConfirm(false);
    action.run(async () => {
      try {
        const result = await post(`/player/attempts/${game.attemptId}/submit`, {
          answers: game.questions.map((q) => ({ questionId: q.id, optionId: answers[q.id] })),
        });
        navigate(`/player/results/${result.id}`, { replace: true });
      } catch (e) {
        if (e.status === 409) reload();
        throw e;
      }
    });
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setConfirm(true);
      }}
    >
      <div className="section-head">
        <h2>Your answers</h2>
        <span className="micro">
          {count}/{game.questions.length} ANSWERED
        </span>
      </div>
      {game.questions.map((q, i) => (
        <fieldset className="sheet play-question" key={q.id}>
          <legend>
            <span className="micro">
              QUESTION {i + 1} · {q.points} PTS
            </span>
            <strong>{q.text}</strong>
          </legend>
          {q.options.map((o, j) => (
            <label className="answer-option" key={o.id}>
              <input
                type="radio"
                name={`q-${q.id}`}
                checked={answers[q.id] === o.id}
                onChange={() => setAnswers({ ...answers, [q.id]: o.id })}
                required
              />
              <span className="option-letter">{String.fromCharCode(65 + j)}</span>
              <span>{o.text}</span>
            </label>
          ))}
        </fieldset>
      ))}
      <Notice>{action.error}</Notice>
      <div className="form-actions">
        <button
          className="button primary"
          disabled={action.busy || count !== game.questions.length}
        >
          <Send size={16} />
          {action.busy ? 'Submitting…' : 'Submit answers'}
        </button>
      </div>
      {confirm && (
        <Modal
          title="Submit your answers?"
          eyebrow="FINAL SUBMISSION"
          onClose={() => setConfirm(false)}
        >
          <p className="muted">
            You’ve answered all {game.questions.length} questions. You won’t be able to change your
            answers after this.
          </p>
          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={() => setConfirm(false)}>
              Review answers
            </button>
            <button
              type="button"
              className="button primary"
              onClick={finish}
              disabled={action.busy}
            >
              Confirm submission
            </button>
          </div>
        </Modal>
      )}
    </form>
  );
}
export function ResultHistory({ host = false }) {
  const state = useLoad(host ? '/host/results' : '/player/results', true);
  return (
    <>
      <PageTitle
        eyebrow={host ? 'HOST STUDIO' : 'PLAYER STUDIO'}
        title={host ? 'Results' : 'My results'}
        description={
          host
            ? 'Final scores from players assigned to your games.'
            : 'Your completed games and final scores.'
        }
      />
      <LoadState state={state}>
        {(list) =>
          list.length ? (
            <div className="item-list">
              {list.map((r) => {
                const content = (
                  <>
                    <div className="list-icon">
                      <Trophy size={19} />
                    </div>
                    <div className="list-copy">
                      <h3>{r.title}</h3>
                      <p>
                        {host ? `${r.playerName} · ` : ''}
                        {date(r.submittedAt)}
                      </p>
                    </div>
                    <span className="score-pill">
                      {r.score} / {r.maxScore}
                    </span>
                  </>
                );
                return host ? (
                  <div className="list-item" key={r.id}>
                    {content}
                  </div>
                ) : (
                  <Link className="list-item" key={r.id} to={`/player/results/${r.id}`}>
                    {content}
                    <ArrowRight size={15} />
                  </Link>
                );
              })}
            </div>
          ) : (
            <Empty title="No results yet." icon={Award}>
              {host
                ? 'Scores will appear here once your players submit a quiz.'
                : 'Submit an assigned quiz to see your score here.'}
            </Empty>
          )
        }
      </LoadState>
    </>
  );
}
export function PlayerResult() {
  const { attemptId } = useParams(),
    state = useLoad(`/player/results/${attemptId}`);
  return (
    <>
      <Link className="back-link" to="/player/results">
        <ArrowLeft size={15} /> My results
      </Link>
      <LoadState state={state}>
        {(r) => (
          <>
            <PageTitle eyebrow="FINAL RESULT" title="Game complete." description={r.title} />
            <div className="result-sheet">
              <div className="result-icon">
                <Trophy size={30} />
              </div>
              <span className="micro">YOUR SCORE</span>
              <div className="big-score">
                {r.score}
                <small> / {r.maxScore}</small>
              </div>
              <h2>
                {r.correctCount} of {r.questionCount} correct
              </h2>
              <p className="muted">Submitted {date(r.submittedAt)}</p>
              <Link className="button primary" to="/player">
                Back to my games <ArrowRight size={16} />
              </Link>
            </div>
          </>
        )}
      </LoadState>
    </>
  );
}
