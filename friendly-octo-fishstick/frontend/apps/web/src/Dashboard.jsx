/**
 * `/dashboard` is kept as an alias for the campaign workspace.
 *
 * The workspace itself lives in `workspace/Workspace.jsx`; this module exists
 * so older links and bookmarks to /dashboard keep resolving.
 */
export { default } from './workspace/Workspace';
