import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import "@fontsource/big-shoulders-display/600";
import "@fontsource/big-shoulders-display/800";
import "@fontsource-variable/archivo/wdth";
import "./styles/global.css";
import { Shell } from "./components/Shell";
import { Landing } from "./pages/Landing";
import { Search } from "./pages/Search";
import { Profile } from "./pages/Profile";
import { Ranks } from "./pages/Ranks";
import { Studio } from "./pages/Studio";
import { Trust } from "./pages/Trust";
import { NotFound } from "./pages/NotFound";

const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { path: "/", element: <Landing /> },
      { path: "/search", element: <Search /> },
      { path: "/f/:id", element: <Profile /> },
      { path: "/ranks", element: <Ranks /> },
      { path: "/studio", element: <Studio /> },
      { path: "/trust", element: <Trust /> },
      { path: "*", element: <NotFound /> },
    ],
  },
], { basename: import.meta.env.BASE_URL.replace(/\/$/, "") || "/" });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
