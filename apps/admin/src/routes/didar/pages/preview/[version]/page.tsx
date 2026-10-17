import { useParams } from "react-router-dom";
import { Workspace } from "../../../../../lib/didar";
import { PagePreview } from "@didar-ui/content-editor";
export default function Preview() {
  const { version } = useParams();
  return (
    <Workspace>
      <PagePreview version={version!} />
    </Workspace>
  );
}
