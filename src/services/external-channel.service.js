import { environment } from '../config/environment.js';
export const getOllinUrl = () => environment.ollinUrl || '';
export const getContactUrl = () => environment.externalContactUrl || '';
