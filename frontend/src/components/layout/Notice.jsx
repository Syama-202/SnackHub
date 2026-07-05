import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { apiFetch } from '../../services/api';
import { Icon, cx } from '../ui';

const KEY = 'sh_notice_closed';
const closedId = () => {
  try {
    return Number(sessionStorage.getItem(KEY)) || null;
  } catch {
    return null;
  }
};

/**
 * The shop-wide announcement an admin sets ("Closed on 12 November for Diwali"). Closing it
 * hides that announcement for this visit; a new one shows again. Nothing shows if there is
 * none or the server cannot be reached.
 */
export default function Notice() {
  const [notice, setNotice] = useState(null);
  // asked again once the session is back after a reload: the demo's announcement lives with its session
  const signedIn = useSelector((state) => Boolean(state.auth.accessToken));
  useEffect(() => {
    let gone = false;
    apiFetch('/notice')
      .then((r) => !gone && r?.notice && r.notice.id !== closedId() && setNotice(r.notice))
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [signedIn]);
  if (!notice) return null;
  const close = () => {
    try {
      sessionStorage.setItem(KEY, String(notice.id));
    } catch {
      // private windows may refuse storage; the banner still closes for this page
    }
    setNotice(null);
  };
  return (
    <div role="status" className={cx(notice.tone === 'warning' ? 'bg-sun text-grey-800' : 'bg-orange-deep text-white')}>
      <div className="page flex items-center justify-center gap-3 py-2 text-sm font-semibold">
        <span className="text-center">{notice.message}</span>
        <button type="button" onClick={close} aria-label="Close this announcement" className="-m-2 shrink-0 rounded-full p-2 hover:bg-black/10">
          <Icon name="x" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
