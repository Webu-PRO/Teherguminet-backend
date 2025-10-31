declare module "@react-email/components" {
  import type { ComponentType, CSSProperties } from "react"

  export interface BaseProps {
    style?: CSSProperties
    children?: React.ReactNode
    [key: string]: unknown
  }

  export interface HeadingProps extends BaseProps {
    as?: keyof JSX.IntrinsicElements
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
}
