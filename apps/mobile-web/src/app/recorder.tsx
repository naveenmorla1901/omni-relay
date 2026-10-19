import { AccessBoundary } from '@/components/access-boundary';
import { RoleScreen } from '@/components/role-screen';

export default function RecorderScreen() {
  return (
    <AccessBoundary>
      <RoleScreen
        role="recorder"
        title="Recorder"
        summary="Camera-first capture. Point a phone at the screen or page and wait for an Admin to join."
        bullets={[
          'Only the Recorder pipeline runs: camera, CV, and encoder. Pause them when the app backgrounds.',
          'Vision Camera on native, getUserMedia on web — both behind ICameraSource.',
          'Correct the screen region and keep streaming even when detection is unsure.',
          'Stream 1080p+ with maintain-resolution, low FPS, and a generous bitrate budget.',
        ]}
        nextMilestone="M1 pairs the devices; M2 brings the camera feed. Battery-aware pause/resume is tracked as a requirement for the native pipeline."
      />
    </AccessBoundary>
  );
}
