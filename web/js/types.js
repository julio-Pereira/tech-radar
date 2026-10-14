// @ts-check
// Shared JSDoc typedefs only — no runtime code. Other modules reference these
// via `@typedef {import('./types.js').Course} Course`.

/** @typedef {{ id: string, name: string, category: string }} Source */
/** @typedef {{ id: string, title: string, url: string, sourceId: string, sourceName: string, category: string, publishedAt: string, summary: string, author?: string, kind?: string }} Item */
/** @typedef {{ id: string, label: string, sourceId?: string, category?: string, kind?: string }} Theme */
/** @typedef {{ title: string, url: string }} Ref */
/** @typedef {{ slug: string, title: string, subtitle: string, category: string, level: string, tags: string[], estimatedHours: number, milestoneCount: number }} IndexEntry */
/** @typedef {{ question: string, options: string[], answer: number, explanation?: string }} QuizQuestion */
/** @typedef {{ key: string, kind: string, title?: string, html: string }} HandsOnBlock */
/** @typedef {{ id: string, title: string, kind: 'prose' | 'handson', html?: string, intro?: string, blocks?: HandsOnBlock[] }} Section */
/** @typedef {{ id: string, order: number, title: string, summary: string, estimatedMinutes: number, html: string, sections?: Section[], references?: Ref[], quiz?: QuizQuestion[], completion?: string, reviewedAt?: string, reviewDue?: string }} Milestone */
/** @typedef {{ slug: string, title: string, subtitle: string, category: string, tags: string[], level: string, lang: string, estimatedHours: number, sources?: Ref[], milestones: Milestone[] }} Course */
/** @typedef {{ ref: string, why: string, optional?: boolean, whole?: boolean, courseSlug: string, courseTitle: string, milestoneId?: string, milestoneTitle?: string, estimatedMinutes?: number, estimatedHours?: number, group?: string }} PathStep */
/** @typedef {{ slug: string, title: string, subtitle: string, steps: PathStep[], estimatedHours: number }} Path */
/** @typedef {{ term: string, anchor: string, slug: string, track: string, summary: string, marco?: string, marcoId?: string }} GlossaryEntry */
/** @typedef {{ kind: 'course' | 'milestone' | 'glossary', title: string, summary?: string, slug: string, marcoId?: string, track?: string, tags?: string[], headings?: string[] }} SearchDoc */
/** @typedef {{ slug: string, marcoId: string, title: string, estimatedMinutes: number }} SkillMilestoneRef */
/** @typedef {{ id: string, label: string, group: string, totalMinutes: number, milestones: SkillMilestoneRef[] }} Skill */
/** @typedef {{ slug: string, marcoId: string, milestoneTitle: string, question: string, options: string[], answer: number, explanation?: string }} QuizBankItem */

export {};
