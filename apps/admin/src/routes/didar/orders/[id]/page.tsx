import { useParams } from "react-router-dom";
import { Workspace } from "../../../../lib/didar";
import { Orders } from "@didar-ui/orders";
export default function Page() {
  const { id } = useParams();
  return (
    <Workspace>
      <Orders id={id} />
    </Workspace>
  );
}
