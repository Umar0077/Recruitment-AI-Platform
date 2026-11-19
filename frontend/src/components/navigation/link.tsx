"use client";
import NextLink from "next/link";
import { forwardRef, type ComponentProps } from "react";
import { useNavigation } from "./provider";

/** Next still handles modified clicks, downloads and external links. Only eligible same-tab navigation transitions. */
const Link = forwardRef<HTMLAnchorElement, ComponentProps<typeof NextLink>>(function Link({ onNavigate, href, replace, scroll, ...props }, ref) {
  const navigation = useNavigation();
  return <NextLink {...props} ref={ref} href={href} replace={replace} scroll={scroll} onNavigate={event => {
    let prevented = false;
    onNavigate?.({ preventDefault: () => { prevented = true; event.preventDefault(); } });
    // Preserve Next's URL-object resolution and any caller cancellation.
    if (prevented || typeof href !== "string" || !navigation) return;
    event.preventDefault();
    navigation.navigate(href, replace, scroll);
  }} />;
});
export default Link;
