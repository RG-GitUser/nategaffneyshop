/**
 * A container built in the admin dashboard ("Add container"). Field labels
 * are for the admin's reference; visitors see the title and the field
 * values, each rendered as its own block of paragraphs.
 */
export default function CustomSection({ container }) {
  if (!container) return null

  const blocks = (container.fields || [])
    .map((f) => (f.value || '').trim())
    .filter(Boolean)

  // Nothing written yet (or everything deleted) — stay off the page.
  if (!container.title && blocks.length === 0) return null

  return (
    <section className="section rise">
      {container.title && (
        <div className="section__head">
          <h2 className="section__title">{container.title}</h2>
        </div>
      )}

      <div className={`custom-copy custom-copy--${container.accent || 'navy'}`}>
        {blocks.map((block, i) =>
          block
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean)
            .map((p, j) => <p key={`${i}-${j}`}>{p}</p>),
        )}
      </div>
    </section>
  )
}
