import { Redirect } from 'expo-router';

/** Backward-compatible alias for the old Display route. */
export default function DisplayAlias() {
  return <Redirect href="/projector" />;
}
