export { getT } from './translations';
export type { Lang } from './translations';

import { useApp } from '../../../app/store';
import { getT } from './translations';

export function useT() {
  const { state } = useApp();
  return getT(state.settings.language ?? 'ko');
}
