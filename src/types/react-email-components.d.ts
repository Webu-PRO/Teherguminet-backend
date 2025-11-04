declare module "@react-email/components" {
  import type {
    AnchorHTMLAttributes,
    ComponentType,
    CSSProperties,
    ReactNode,
  } from "react"

  export interface BaseProps {
    style?: CSSProperties
    className?: string
    children?: ReactNode
    [key: string]: unknown
  }

  export type AnchorProps = BaseProps &
    AnchorHTMLAttributes<HTMLAnchorElement>

  export interface HeadingProps extends BaseProps {
    as?: keyof JSX.IntrinsicElements
  }

  export interface TailwindProps {
    children: ReactNode
    config?: Record<string, unknown>
  }

  export const Html: ComponentType<BaseProps>
  export const Head: ComponentType<BaseProps>
  export const Preview: ComponentType<BaseProps>
  export const Body: ComponentType<BaseProps>
  export const Container: ComponentType<BaseProps>
  export const Section: ComponentType<BaseProps>
  export const Text: ComponentType<BaseProps>
  export const Heading: ComponentType<HeadingProps>
  export const Hr: ComponentType<BaseProps>
  export const Button: ComponentType<AnchorProps>
  export const Link: ComponentType<AnchorProps>
  export const Tailwind: ComponentType<TailwindProps>
}
