import { useEffect, useState } from 'react'

/**
 * Styled replacement for window.confirm — same card, tokens and type as
 * the rest of the dashboard instead of the browser's native dialog.
 *
 *   const ok = await confirmDialog({
 *     title: 'Delete booking?',
 *     message: 'This cannot be undone.',
 *     confirmLabel: 'Delete',
 *     danger: true,          // red confirm button for destructive actions
 *   })
 *
 * ConfirmHost renders the dialog; it's mounted once in AdminApp. If the
 * host isn't mounted yet, this falls back to the native confirm so a call
 * can never silently no-op.
 */

let show = null

export function confirmDialog(opts) {
  return show ? show(opts) : Promise.resolve(window.confirm(opts.message))
}

export function ConfirmHost() {
  const [state, setState] = useState(null) // { opts, resolve }
  const [typed, setTyped] = useState('')

  useEffect(() => {
    show = (opts) =>
      new Promise((resolve) => {
        setTyped('')
        setState({ opts, resolve })
      })
    return () => {
      show = null
    }
  }, [])

  useEffect(() => {
    if (!state) return
    const onKey = (e) => e.key === 'Escape' && done(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  if (!state) return null
  const done = (v) => {
    state.resolve(v)
    setState(null)
  }

  return (
    <div
      className="adm-modal"
      role="alertdialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && done(false)}
    >
      <div className="adm-modal__card">
        {state.opts.title && <h3 className="adm-h3">{state.opts.title}</h3>}
        <p className="adm-confirm__msg">{state.opts.message}</p>
        {state.opts.verifyText && (
          /* Type-to-confirm for the truly destructive stuff: the confirm
             button stays dead until the name matches exactly. */
          <div className="adm-confirm__verify">
            <label htmlFor="adm-confirm-verify">
              Type <strong>{state.opts.verifyText}</strong> to confirm
            </label>
            <input
              id="adm-confirm-verify"
              type="text"
              autoFocus
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
        )}
        <div className="adm-modal__actions">
          <button
            className="adm-mini"
            onClick={() => done(false)}
            autoFocus={!state.opts.verifyText}
          >
            {state.opts.cancelLabel || 'Cancel'}
          </button>
          {state.opts.choices ? (
            // Multi-choice: each button resolves with its value.
            state.opts.choices.map((c) => (
              <button
                key={c.value}
                className={`adm-save ${c.danger ? 'adm-btn-danger' : 'btn btn--primary'}`}
                onClick={() => done(c.value)}
              >
                {c.label}
              </button>
            ))
          ) : (
            <button
              className={`adm-save ${state.opts.danger ? 'adm-btn-danger' : 'btn btn--primary'}`}
              disabled={Boolean(
                state.opts.verifyText &&
                  typed.trim() !== state.opts.verifyText.trim(),
              )}
              onClick={() => done(true)}
            >
              {state.opts.confirmLabel || 'Confirm'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
