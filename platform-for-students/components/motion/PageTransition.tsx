'use client';

import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { pageVariants } from '@/lib/motion';

/** One mounted route at a time: exiting RSC children can otherwise duplicate chat
 * viewports and keep stale scroll/read effects alive. Entry animation is retained. */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="grid min-h-full grid-cols-1 grid-rows-1 [&>*]:col-start-1 [&>*]:row-start-1">
        <motion.div
          key={pathname}
          variants={pageVariants}
          initial="hidden"
          animate="show"
          className="min-h-full"
        >
          {children}
        </motion.div>
    </div>
  );
}
