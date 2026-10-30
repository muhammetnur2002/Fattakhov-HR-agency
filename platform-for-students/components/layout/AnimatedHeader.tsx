'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Logo } from '@/components/brand/Logo';
import { NavTabs, type NavItem } from './NavTabs';
import { UserMenu } from './UserMenu';
import styles from './AnimatedHeader.module.css';

/** Play once per browser document; client-side navigation keeps the panel assembled. */
export function AnimatedHeader({ nav, user, bell, backToCrmUrl, wide }: {
  nav: NavItem[];
  user: { name: string; photoUrl?: string | null; subtitle?: string; href?: string };
  bell?: ReactNode;
  backToCrmUrl?: string | null;
  wide: boolean;
}) {
  return <HeaderScene nav={nav} user={user} bell={bell} backToCrmUrl={backToCrmUrl} wide={wide} />;
}

function HeaderScene({ nav, user, bell, backToCrmUrl, wide }: Parameters<typeof AnimatedHeader>[0]) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const stage = el.querySelector<HTMLElement>('[data-header-stage]')!;
    const panel = el.querySelector<HTMLElement>('[data-header-panel]')!;
    const logo = el.querySelector<HTMLElement>('[data-header-logo]')!;
    const targets = [...panel.querySelectorAll<HTMLElement>('nav > a, [data-tour="profile"], [data-tour="bell"]')];
    const animations: Animation[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    let finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      timers.forEach(clearTimeout);
      animations.forEach(a => a.cancel());
      stage.replaceChildren();
      el!.dataset.ready = 'true';
      panel.inert = false;
      logo.inert = false;
    }
    const animate = (node: HTMLElement, frames: Keyframe[], timing: KeyframeAnimationOptions) => {
      animations.push(node.animate(frames, { fill: 'both', ...timing }));
    };
    // Employer pages can remount AppShell, unlike the shared student layout.
    // A document marker survives both cases but resets on a real site reload.
    const alreadyShown = document.documentElement.dataset.fhrHeaderIntro === 'shown';
    document.documentElement.dataset.fhrHeaderIntro = 'shown';
    if (alreadyShown || media.matches || !el.animate) { finish(); return; }
    el.dataset.ready = 'false';
    panel.inert = true;
    logo.inert = true;
    try {
      const bounds = el.getBoundingClientRect();
      const cx = bounds.width / 2 - 19;
      const cy = bounds.height / 2 - 22;
      const pieces = Array.from({ length: 6 }, (_, i) => {
        const piece = document.createElement('span');
        piece.className = styles.piece;
        piece.style.left = `${cx}px`;
        piece.style.top = `${cy}px`;
        piece.style.clipPath = `inset(${Math.floor(i / 2) * 33.333}% ${i % 2 ? 0 : 50}% ${66.667 - Math.floor(i / 2) * 33.333}% ${i % 2 ? 50 : 0}%)`;
        stage.append(piece);
        animate(piece, [{ opacity: 0, transform: 'translateY(5px) scale(.88)', filter: 'blur(4px)' }, { opacity: 1, transform: 'translateY(0) scale(1)', filter: 'blur(0)' }], { duration: 1000, easing: 'cubic-bezier(.22,1,.36,1)' });
        return piece;
      });
      // 1 second appearance, then 2 full seconds with the assembled logo.
      timers.push(setTimeout(() => {
        if (finished) return;
        try {
          const targetBounds = targets.map(target => target.getBoundingClientRect());
          animate(panel, [{ opacity: 0, transform: 'scaleX(.12) scaleY(.72)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 1000, easing: 'cubic-bezier(.16,1,.3,1)' });
          targets.forEach((target, i) => {
            const b = targetBounds[i];
            const dx = bounds.width / 2 - (b.left - bounds.left + b.width / 2);
            animate(target, [{ opacity: 0, transform: `translateX(${dx}px) scale(.2)` }, { opacity: 1, transform: 'translateX(0) scale(1)' }], { duration: 875, delay: 225 + i * 35, easing: 'cubic-bezier(.16,1,.3,1)' });
          });
          pieces.forEach((piece, i) => {
            const b = targetBounds[i % targets.length];
            const dx = b.left - bounds.left + b.width / 2 - (cx + 19);
            animate(piece, [{ opacity: 1, transform: 'translate(0,0)' }, { opacity: .55, offset: .55, transform: `translate(${dx * .75}px,${i % 2 ? 10 : -12}px) rotate(${i % 2 ? 24 : -24}deg) scale(.7)` }, { opacity: 0, transform: `translate(${dx}px,0) scale(.35)` }], { duration: 875, easing: 'cubic-bezier(.2,.7,.2,1)' });
            const assembled = piece.cloneNode() as HTMLElement;
            const l = logo.getBoundingClientRect();
            assembled.style.left = `${l.left - bounds.left + (l.width - 28) / 2}px`;
            assembled.style.top = `${l.top - bounds.top + (l.height - 32) / 2}px`;
            assembled.style.width = '28px';
            assembled.style.height = '32px';
            stage.append(assembled);
            animate(assembled, [{ opacity: 0, transform: `translate(${42 + i * 8}px,${i % 2 ? 14 : -14}px) rotate(${i % 2 ? 22 : -22}deg) scale(.6)` }, { opacity: 1, transform: 'translate(0,0) scale(1)' }], { duration: 690, delay: 440 + i * 30, easing: 'cubic-bezier(.16,1,.3,1)' });
          });
          timers.push(setTimeout(finish, 1500));
        } catch { finish(); }
      }, 3000));
    } catch { finish(); }
    // Resizing or requesting less motion must never leave an invisible/inert menu.
    window.addEventListener('resize', finish);
    media.addEventListener('change', finish);
    return () => {
      finish();
      window.removeEventListener('resize', finish);
      media.removeEventListener('change', finish);
    };
  }, []);

  return <div ref={root} data-ready="false" data-animated-header className={`${styles.header} ${wide ? styles.wide : ''}`}>
    <div data-header-logo className={styles.logo}><Logo className="min-h-11 min-w-9 justify-center" /></div>
    <div data-header-panel className={styles.panel}>
      <div className={styles.navigation}><NavTabs items={nav} className={styles.tabs} /></div>
      <div className={styles.account}><UserMenu name={user.name} photoUrl={user.photoUrl} subtitle={user.subtitle} href={user.href} backToCrmUrl={backToCrmUrl} bell={bell} /></div>
    </div>
    <div data-header-stage aria-hidden="true" className={styles.stage} />
  </div>;
}
