'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import type { InstrumentMeta } from '@/lib/preseeded-trades';
import type { PositionSide } from '@/lib/trading-math';
import { OrderExecutionBox } from '@/components/terminal/OrderExecutionBox';

interface SlideUpOrderSheetProps {
  open: boolean;
  onClose: () => void;
  instrument: InstrumentMeta;
  side: PositionSide;
  onChangeSide: (side: PositionSide) => void;
  onActionNotice: (msg: string, isError?: boolean) => void;
}

export function SlideUpOrderSheet({
  open,
  onClose,
  instrument,
  side,
  onChangeSide,
  onActionNotice,
}: SlideUpOrderSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleDragEnd = (
    _: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) => {
    if (info.offset.y > 90 || info.velocity.y > 450) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Order Ticket"
        >
          <motion.button
            type="button"
            aria-label="Dismiss Order Sheet"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-[#07080A]/75 backdrop-blur-[4px]"
          />

          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={handleDragEnd}
            style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
            className={`elevation-floating relative z-10 max-h-[88dvh] w-full overflow-y-auto rounded-t-[16px] border-t-2 bg-[var(--bg-floating)] ${
              side === 'LONG' ? 'border-t-[var(--long)]' : 'border-t-[var(--short)]'
            }`}
          >
            <div className="flex flex-col items-center py-2.5">
              <span className="h-1 w-10 rounded-full bg-[var(--border-focus)]" />
            </div>

            <OrderExecutionBox
              key={`${instrument.id}-${side}`}
              instrument={instrument}
              side={side}
              onChangeSide={onChangeSide}
              onCloseSheet={onClose}
              onActionNotice={onActionNotice}
              onOrderPlaced={onClose}
              variant="sheet"
            />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
