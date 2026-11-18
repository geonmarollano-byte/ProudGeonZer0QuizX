import { Link } from 'react-router-dom';
import { BookOpen, ChevronRight, Gamepad2, LibraryBig } from 'lucide-react';
export function PageTitle({ eyebrow, title, description, children }) {
  return (
    <div className="page-title">
      <div>
        <div className="eyebrow">
          <i />
          {eyebrow}
        </div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
export function Empty({ icon: Icon = BookOpen, title, children, action }) {
  return (
    <section className="empty-state">
      <div className="empty-art">
        <Icon size={27} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </section>
  );
}
export function Badge({ value }) {
  const label = {
    DRAFT: 'Draft',
    PUBLISHED: 'Published',
    ASSIGNED: 'Ready to play',
    STARTED: 'In progress',
    SUBMITTED: 'Completed',
    ACTIVE: 'Activated',
    PENDING: 'Awaiting activation',
  };
  return <span className={`badge badge-${value.toLowerCase()}`}>{label[value] || value}</span>;
}
export function GamesList({ games, host = false }) {
  return (
    <div className="item-list">
      {games.map((g) => (
        <Link key={g.id} className="list-item" to={`/${host ? 'host' : 'player'}/games/${g.id}`}>
          <span className={`list-icon ${host ? '' : 'peach'}`}>
            {host ? <LibraryBig size={21} /> : <Gamepad2 size={21} />}
          </span>
          <div className="list-copy">
            <h3>{g.title}</h3>
            <p>
              {g.questionCount} {g.questionCount === 1 ? 'question' : 'questions'} ·{' '}
              {host ? `${g.assignedCount} assigned` : `From ${g.hostName}`}
            </p>
          </div>
          <Badge value={host ? g.status : g.progress} />
          <ChevronRight size={16} />
        </Link>
      ))}
    </div>
  );
}
