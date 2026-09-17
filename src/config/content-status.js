export const CONTENT_STATUS = Object.freeze({ APPROVED: 'approved', DEMO: 'demo', COMING_SOON: 'coming-soon', HIDDEN: 'hidden' });
export const isVisible = (item) => item?.contentStatus !== CONTENT_STATUS.HIDDEN;
