import Link from "next/link";
import type { MouseEventHandler, ReactNode } from "react";

import styles from "./Button.module.css";

type ButtonVariant = "primary" | "secondary" | "outline";
type ButtonSize = "small" | "medium" | "large";

type CommonProps = {
  children: ReactNode;
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
};

type LinkButtonProps = CommonProps & {
  href: string;
  prefetch?: boolean;
  rel?: string;
  target?: string;
};

type NativeButtonProps = CommonProps & {
  href?: undefined;
  disabled?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  type?: "button" | "submit" | "reset";
};

export type ButtonProps = LinkButtonProps | NativeButtonProps;

function getClassName({
  className,
  size = "medium",
  variant = "primary",
}: Pick<ButtonProps, "className" | "size" | "variant">) {
  return [styles.button, styles[variant], styles[size], className]
    .filter(Boolean)
    .join(" ");
}

function isLinkButton(props: ButtonProps): props is LinkButtonProps {
  return "href" in props && typeof props.href === "string";
}

export function Button(props: ButtonProps) {
  const className = getClassName(props);

  if (isLinkButton(props)) {
    const { children, href, prefetch, rel, target } = props;

    return (
      <Link
        href={href}
        className={className}
        prefetch={prefetch}
        rel={rel}
        target={target}
      >
        {children}
      </Link>
    );
  }

  const { children, disabled, onClick, type } = props;

  return (
    <button
      type={type ?? "button"}
      className={className}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
