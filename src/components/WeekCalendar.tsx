import React, { useMemo, useRef } from 'react';
import '../styles/Calendar.css';
import type { ScheduleCell, CellStatus } from '../service/Api-scheduler';

export type Mode = 'student' | 'tutor';

export interface WeekCalendarProps {
  weekStart: string;
  cells: ScheduleCell[];
  mode: Mode;
  selectedKeys?: Set<string>;
  onToggle?: (key: string, cell: ScheduleCell) => void;
  onSinglePick?: (cell: ScheduleCell) => void;
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
  onClear?: () => void;
}

/** HH:mm normalizado */
function toHHMM(h: string) {
  const s = (h ?? '').trim();
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : s.slice(0, 5);
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function hours(): string[] {
  return Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);
}

const H_LIST = hours();

function nextSelectableHour(): Date {
  const now = new Date();
  now.setSeconds(0, 0);
  const cut = new Date(now);
  cut.setMinutes(0, 0, 0);
  cut.setHours(cut.getHours() + (now.getMinutes() > 0 ? 1 : 0));
  return cut;
}
function slotToLocal(dateISO: string, hhmm: string): Date {
  const [H, M] = toHHMM(hhmm).split(':').map(Number);
  const dt = new Date(dateISO + 'T00:00:00');
  dt.setHours(H, M, 0, 0);
  return dt;
}
function isPastSlot(dateISO: string, hhmm: string): boolean {
  return slotToLocal(dateISO, toHHMM(hhmm)).getTime() < nextSelectableHour().getTime();
}

function classForStatus(status: CellStatus | undefined | null): string {
  const s = (status ?? '').toString().toUpperCase();
  if (s === 'DISPONIBLE') return 'cell available';
  if (s === 'PENDIENTE' || s === 'ACTIVA') return 'cell pending';
  if (s === 'ACEPTADO' || s === 'ACEPTADA') return 'cell accepted';
  if (s === 'CANCELADO' || s === 'CANCELADA') return 'cell canceled';
  if (s === 'VENCIDA' || s === 'EXPIRED' || s === 'INCUMPLIDA' || s === 'FINALIZADA') return 'cell expired';
  return 'cell disabled';
}

function getStatusLabel(status: CellStatus | undefined | null): string {
  const s = (status ?? '').toString().toUpperCase();
  if (s === 'DISPONIBLE') return 'Disponible';
  if (s === 'PENDIENTE' || s === 'ACTIVA') return 'Pendiente';
  if (s === 'ACEPTADO' || s === 'ACEPTADA') return 'Aceptada';
  if (s === 'CANCELADO' || s === 'CANCELADA') return 'Cancelada';
  if (s === 'VENCIDA' || s === 'EXPIRED') return 'Vencida';
  if (s === 'INCUMPLIDA') return 'Incumplida';
  if (s === 'FINALIZADA') return 'Finalizada';
  return '';
}

const WeekCalendar: React.FC<WeekCalendarProps> = ({
  weekStart, cells, mode, selectedKeys, onToggle, onSinglePick,
}) => {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const map = useMemo(() => {
    const priority: Record<string, number> = {
      'ACEPTADO': 5, 'ACEPTADA': 5,
      'PENDIENTE': 4, 'ACTIVA': 4,
      'DISPONIBLE': 3,
      'CANCELADO': 2, 'CANCELADA': 2,
      'INCUMPLIDA': 1, 'FINALIZADA': 1, 'VENCIDA': 1, 'EXPIRED': 1
    };
    const pr = (s?: string | null) => priority[(s ?? '').toString().toUpperCase()] ?? 0;
    const m = new Map<string, ScheduleCell>();
    for (const c of cells || []) {
      const hhmm = toHHMM(c.hour);
      const key = `${c.date}_${hhmm}`;
      const next = { ...c, hour: hhmm };
      const prev = m.get(key);
      if (!prev || pr(next.status) >= pr(prev.status)) m.set(key, next);
    }
    return m;
  }, [cells]);

  const mouseDown = useRef(false);
  const paintMode = useRef<'select' | 'deselect' | null>(null);
  const processedInDrag = useRef<Set<string>>(new Set());

  const handleDown = (key: string, cell: ScheduleCell) => {
    if (mode !== 'tutor' || !onToggle) return;
    mouseDown.current = true;
    processedInDrag.current = new Set();
    const isSelected = selectedKeys?.has(key) || false;
    paintMode.current = isSelected ? 'deselect' : 'select';
    processedInDrag.current.add(key);
    onToggle(key, cell);
  };
  const handleEnter = (key: string, cell: ScheduleCell) => {
    if (!mouseDown.current || mode !== 'tutor' || !onToggle) return;
    if (processedInDrag.current.has(key)) return;
    processedInDrag.current.add(key);
    const isSelected = selectedKeys?.has(key) || false;
    if ((paintMode.current === 'select' && !isSelected) ||
        (paintMode.current === 'deselect' && isSelected)) {
      onToggle(key, cell);
    }
  };
  const handleUp = () => {
    mouseDown.current = false;
    paintMode.current = null;
    processedInDrag.current.clear();
  };

  React.useEffect(() => {
    const globalHandleUp = () => { if (mouseDown.current) handleUp(); };
    globalThis.addEventListener('mouseup', globalHandleUp);
    globalThis.addEventListener('touchend', globalHandleUp);
    return () => {
      globalThis.removeEventListener('mouseup', globalHandleUp);
      globalThis.removeEventListener('touchend', globalHandleUp);
    };
  }, []);

  const handleClick = (_key: string, cell: ScheduleCell) => {
    if (mode === 'student') {
      const canPick = (cell.status ?? '').toString().toUpperCase() === 'DISPONIBLE';
      if (canPick && onSinglePick) onSinglePick(cell);
    }
  };

  const renderCell = (d: string, h: string) => {
    const key = `${d}_${h}`;
    const raw = map.get(key) || { date: d, hour: h, status: null } as ScheduleCell;

    let statusForUI = (raw.status ?? null) as CellStatus | null;
    const sUp = (statusForUI ?? '').toString().toUpperCase();
    if (isPastSlot(d, h) && (sUp === 'DISPONIBLE' || sUp === 'PENDIENTE' || sUp === 'ACTIVA')) {
      statusForUI = 'VENCIDA' as CellStatus;
    }

    const isSelected = !!selectedKeys?.has(key);
    const canPick = mode === 'student'
      ? ((statusForUI ?? '').toString().toUpperCase() === 'DISPONIBLE')
      : true;

    const css = [
      classForStatus(statusForUI),
      isSelected ? 'selected' : '',
      canPick ? 'can-pick' : 'not-pickable',
    ].join(' ').trim();

    const label = getStatusLabel(statusForUI);

    return (
      <button
        key={key}
        type="button"
        className={css}
        onMouseDown={(e) => { e.preventDefault(); handleDown(key, raw); }}
        onMouseEnter={() => handleEnter(key, raw)}
        onMouseUp={handleUp}
        onClick={() => handleClick(key, raw)}
        title={`${d} ${h} ${statusForUI || ''}`}
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        {label && <span>{label}</span>}
        {label && <span className="dot" />}
      </button>
    );
  };

  return (
    <fieldset className="calendar-wrapper" aria-label="Week calendar">
      <div className="calendar-grid">
        <div className="col hour-col">
          <div className="head-cell">Hora</div>
          {H_LIST.map(h => <div key={h} className="hour-cell">{h}</div>)}
        </div>

        {days.map((d, idx) => (
          <div key={d} className="col">
            <div className="head-cell">
              {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'][idx]}<br />{d}
            </div>
            {H_LIST.map(h => renderCell(d, h))}
          </div>
        ))}
      </div>
    </fieldset>
  );
};

export default WeekCalendar;
