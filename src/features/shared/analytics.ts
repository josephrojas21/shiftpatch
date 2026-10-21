'use client';
import { useEffect } from 'react';
let analytics: typeof import('posthog-js').default | undefined;
export function Analytics() {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;
    void import('posthog-js').then(({ default: posthog }) => {
      posthog.init(key, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
        person_profiles: 'never',
        persistence: 'memory',
      });
      analytics = posthog;
    });
  }, []);
  return null;
}
export function track(
  event:
    | 'shift_published'
    | 'shift_claimed'
    | 'shift_cancelled'
    | 'credential_uploaded'
    | 'timesheet_submitted',
) {
  analytics?.capture(event);
}
