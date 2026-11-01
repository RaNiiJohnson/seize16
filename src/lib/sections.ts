import { SECTION_LABELS, type Section, type SectionKind } from '@/db/types';

/** "Couplet 1", "Couplet 2"… seulement si le type apparaît plusieurs fois. */
export function sectionTitles(sections: Pick<Section, 'kind'>[]): string[] {
  const totals = new Map<SectionKind, number>();
  for (const s of sections) totals.set(s.kind, (totals.get(s.kind) ?? 0) + 1);
  const seen = new Map<SectionKind, number>();
  return sections.map((s) => {
    const n = (seen.get(s.kind) ?? 0) + 1;
    seen.set(s.kind, n);
    return (totals.get(s.kind) ?? 0) > 1 ? `${SECTION_LABELS[s.kind]} ${n}` : SECTION_LABELS[s.kind];
  });
}
