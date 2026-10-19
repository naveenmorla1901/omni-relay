import { AccessBoundary } from '@/components/access-boundary';
import { RoleScreen } from '@/components/role-screen';

export default function ProjectorScreen() {
  return (
    <AccessBoundary>
      <RoleScreen
        role="display"
        roleLabel="projector"
        title="Projector"
        summary="The projector surface. Render the last image or code push full-screen and keep it there until something new arrives."
        bullets={[
          'Images fit the screen (contain or cover) on a black, chrome-free background.',
          'Code renders through syntax highlighting with an auto-fit, readable font size.',
          'Layout respects the device orientation and keeps the last item until the next push.',
        ]}
        nextMilestone="Full-screen rendering lands in M4 and M7. This route is the user-facing Projector; the wire role remains `display` in the build plan."
      />
    </AccessBoundary>
  );
}
