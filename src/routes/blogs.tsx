import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/blogs")({
  component: () => <Outlet />,
});
