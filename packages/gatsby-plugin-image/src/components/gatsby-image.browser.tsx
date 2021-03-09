/* eslint-disable no-unused-expressions */
import React, {
  Component,
  ElementType,
  useEffect,
  useRef,
  createRef,
  MutableRefObject,
  FunctionComponent,
  ImgHTMLAttributes,
  useState,
  RefObject,
  CSSProperties,
} from "react"
import {
  getWrapperProps,
  hasNativeLazyLoadSupport,
  storeImageloaded,
  hasImageLoaded,
} from "./hooks"
import { PlaceholderProps } from "./placeholder"
import { MainImageProps } from "./main-image"
import { Layout } from "../image-utils"
import { getSizer } from "./layout-wrapper"
import { propTypes } from "./gatsby-image.server"
import { Unobserver } from "./intersection-observer"

// eslint-disable-next-line @typescript-eslint/naming-convention
export interface GatsbyImageProps
  extends Omit<
    ImgHTMLAttributes<HTMLImageElement>,
    "placeholder" | "onLoad" | "src" | "srcSet" | "width" | "height"
  > {
  alt: string
  as?: ElementType
  className?: string
  class?: string
  imgClassName?: string
  image: IGatsbyImageData
  imgStyle?: CSSProperties
  backgroundColor?: string
  objectFit?: CSSProperties["objectFit"]
  objectPosition?: CSSProperties["objectPosition"]
  onLoad?: () => void
  onError?: () => void
  onStartLoad?: (props: { wasCached?: boolean }) => void
}

export interface IGatsbyImageData {
  layout: Layout
  width: number
  height: number
  backgroundColor?: string
  images: Pick<MainImageProps, "sources" | "fallback">
  placeholder?: Pick<PlaceholderProps, "sources" | "fallback">
}

const hasShownWarning = false

class GatsbyImageHydrator extends Component<
  GatsbyImageProps,
  { isLoading: boolean; isLoaded: boolean }
> {
  root: RefObject<HTMLImageElement | undefined> = createRef<
    HTMLImageElement | undefined
  >()
  hydrated: MutableRefObject<boolean> = { current: false }
  lazyHydrator: () => void | null = null
  ref = createRef<HTMLImageElement>()
  unobserveRef: (element: RefObject<HTMLElement | undefined>) => Unobserver

  constructor(props) {
    super(props)

    this.state = {
      isLoading: hasNativeLazyLoadSupport(),
      isLoaded: false,
    }
    console.log(`construct`)
  }

  _lazyHydrate(props, state): Promise<void> {
    return import(`./lazy-hydrate`).then(({ lazyHydrate }) => {
      console.log(props.alt, state.isLoading, state.isLoaded)
      this.lazyHydrator = lazyHydrate(
        {
          image: props.image.images,
          isLoading: state.isLoading,
          isLoaded: state.isLoaded,
          toggleIsLoaded: () => {
            props.onLoad?.()

            this.setState({
              isLoaded: true,
            })
          },
          ref: this.ref,
          ...props,
        },
        this.root,
        this.hydrated
      )
    })
  }

  shouldComponentUpdate(nextProps, nextState): boolean {
    if (this.root.current) {
      console.log(`shouldComponentUpdate`)

      this._lazyHydrate(nextProps, nextState)
    }
    // if (this.root.current) {
    //   const hasSSRHtml = this.root.current.querySelector(
    //     `[data-gatsby-image-ssr]`
    //   )
    //   // On first server hydration do nothing
    //   if (hasNativeLazyLoadSupport() && hasSSRHtml && !this.hydrated.current) {
    //     this.hydrated.current = true
    //     return
    //   }

    //   import(`./lazy-hydrate`).then(({ lazyHydrate }) => {
    //     this.lazyHydrator = lazyHydrate(
    //       {
    //         image: this.props.image.images,
    //         isLoading: this.state.isLoading,
    //         isLoaded: this.state.isLoaded,
    //         toggleIsLoaded: () => {
    //           this.props.onLoad?.()

    //           this.setState({
    //             isLoaded: true,
    //           })
    //         },
    //         ref: this.ref,
    //         loading: this.props.loading,
    //         ...this.props,
    //       },
    //       this.root,
    //       this.hydrated
    //     )
    //   })
    // }

    return false
  }

  componentDidMount(): void {
    if (this.root.current) {
      const hasSSRHtml = this.root.current.querySelector(
        `[data-gatsby-image-ssr]`
      ) as HTMLImageElement
      const cacheKey = JSON.stringify(this.props.image.images)

      // when SSR and native lazyload is supported we'll do nothing ;)
      if (hasNativeLazyLoadSupport() && hasSSRHtml && global.GATSBY___IMAGE) {
        console.log(`native lazy load`)
        this.props.onStartLoad?.({ wasCached: false })

        // When the image is already loaded before we have hydrated, we trigger onLoad and cache the item
        if (hasSSRHtml.complete) {
          this.props.onLoad?.()
          storeImageloaded(cacheKey)
        } else {
          // eslint-disable-next-line @typescript-eslint/no-this-alias
          const _this = this
          // add an onLoad to the image
          hasSSRHtml.addEventListener(`load`, function onLoad() {
            hasSSRHtml.removeEventListener(`load`, onLoad)

            _this.props.onLoad?.()
            storeImageloaded(cacheKey)
          })
        }

        return
      }

      console.log(`fallback lazy load`)
      // Fallback to custom lazy loading (intersection observer)
      import(`./intersection-observer`).then(
        ({ createIntersectionObserver }) => {
          const intersectionObserver = createIntersectionObserver(() => {
            if (this.root.current) {
              this.props.onStartLoad?.({
                wasCached: hasImageLoaded(cacheKey),
              })
              this.setState({
                isLoading: true,
                isLoaded: hasImageLoaded(cacheKey),
              })
            }
          })

          if (this.root.current) {
            // @ts-ignore - hello
            this.unobserveRef = intersectionObserver(this.root)
          }
        }
      )
    }
  }

  componentWillUnmount(): void {
    console.log(`componentWillUnmount`)
    if (this.unobserveRef) {
      this.unobserveRef(this.root)

      // on unmount, make sure we cleanup
      if (this.hydrated.current && this.lazyHydrator) {
        this.lazyHydrator()
      }
    }

    return
  }

  render(): JSX.Element {
    const Type = this.props.as || `div`
    const { width, height, layout } = this.props.image
    const {
      style: wStyle,
      className: wClass,
      ...wrapperProps
    } = getWrapperProps(width, height, layout)

    let className = this.props.className
    // preact class
    if (this.props.class) {
      className = this.props.class
    }

    const sizer = getSizer(layout, width, height)

    console.log(`render`)

    return (
      <Type
        {...wrapperProps}
        style={{
          ...wStyle,
          ...this.props.style,
          backgroundColor: this.props.backgroundColor,
        }}
        className={`${wClass}${className ? ` ${className}` : ``}`}
        ref={this.root}
        dangerouslySetInnerHTML={{
          __html: sizer,
        }}
        suppressHydrationWarning
      />
    )
  }
}

// export const GatsbyImageHydrator2: FunctionComponent<GatsbyImageProps> = function GatsbyImageHydrator({
//   as: Type = `div`,
//   style,
//   className,
//   class: preactClass,
//   onStartLoad,
//   image,
//   onLoad: customOnLoad,
//   backgroundColor,
//   loading = `lazy`,
//   ...props
// }) {
//   if (!image) {
//     if (process.env.NODE_ENV === `development`) {
//       console.warn(`[gatsby-plugin-image] Missing image prop`)
//     }
//     return null
//   }
//   if (preactClass) {
//     className = preactClass
//   }
//   const { width, height, layout, images } = image

//   const root = useRef<HTMLElement>()
//   const hydrated = useRef(false)
//   const unobserveRef = useRef<
//     ((element: RefObject<HTMLElement | undefined>) => void) | null
//   >(null)
//   const lazyHydrator = useRef<(() => void) | null>(null)
//   const ref = useRef<HTMLImageElement | undefined>()
//   const [isLoading, toggleIsLoading] = useState(hasNativeLazyLoadSupport())
//   const [isLoaded, toggleIsLoaded] = useState(false)

//   if (!global.GATSBY___IMAGE && !hasShownWarning) {
//     hasShownWarning = true
//     console.warn(
//       `[gatsby-plugin-image] You're missing out on some cool performance features. Please add "gatsby-plugin-image" to your gatsby-config.js`
//     )
//   }

//   const { style: wStyle, className: wClass, ...wrapperProps } = getWrapperProps(
//     width,
//     height,
//     layout
//   )

//   useEffect((): (() => void) | undefined => {
//     if (root.current) {
//       const hasSSRHtml = root.current.querySelector(
//         `[data-gatsby-image-ssr]`
//       ) as HTMLImageElement

//       // when SSR and native lazyload is supported we'll do nothing ;)
//       if (hasNativeLazyLoadSupport() && hasSSRHtml && global.GATSBY___IMAGE) {
//         onStartLoad?.({ wasCached: false })

//         if (hasSSRHtml.complete) {
//           customOnLoad?.()
//           storeImageloaded(JSON.stringify(images))
//         } else {
//           hasSSRHtml.addEventListener(`load`, function onLoad() {
//             hasSSRHtml.removeEventListener(`load`, onLoad)

//             customOnLoad?.()
//             storeImageloaded(JSON.stringify(images))
//           })
//         }
//         return undefined
//       }

//       // Fallback to custom lazy loading (intersection observer)
//       import(`./intersection-observer`).then(
//         ({ createIntersectionObserver }) => {
//           const intersectionObserver = createIntersectionObserver(() => {
//             if (root.current) {
//               onStartLoad?.({ wasCached: false })
//               toggleIsLoading(true)
//             }
//           })

//           if (root.current) {
//             unobserveRef.current = intersectionObserver(root)
//           }
//         }
//       )
//     }

//     return (): void => {
//       if (unobserveRef.current) {
//         unobserveRef.current(root)

//         // on unmount, make sure we cleanup
//         if (hydrated.current && lazyHydrator.current) {
//           lazyHydrator.current()
//         }
//       }
//     }
//   }, [])

//   useEffect(() => {
//     if (root.current) {
//       const hasSSRHtml = root.current.querySelector(`[data-gatsby-image-ssr]`)
//       // On first server hydration do nothing
//       if (hasNativeLazyLoadSupport() && hasSSRHtml && !hydrated.current) {
//         hydrated.current = true
//         return
//       }

//       import(`./lazy-hydrate`).then(({ lazyHydrate }) => {
//         lazyHydrator.current = lazyHydrate(
//           {
//             image,
//             isLoading,
//             isLoaded,
//             toggleIsLoaded: () => {
//               customOnLoad?.()
//               toggleIsLoaded(true)
//             },
//             ref,
//             loading,
//             ...props,
//           },
//           root,
//           hydrated
//         )
//       })
//     }
//   }, [
//     width,
//     height,
//     layout,
//     images,
//     isLoading,
//     isLoaded,
//     toggleIsLoaded,
//     ref,
//     props,
//   ])

//   const sizer = getSizer(layout, width, height)

//   return (
//     <Type
//       {...wrapperProps}
//       style={{
//         ...wStyle,
//         ...style,
//         backgroundColor,
//       }}
//       className={`${wClass}${className ? ` ${className}` : ``}`}
//       ref={root}
//       dangerouslySetInnerHTML={{
//         __html: sizer,
//       }}
//       suppressHydrationWarning
//     />
//   )
// }

export const GatsbyImage: FunctionComponent<GatsbyImageProps> = function GatsbyImage(
  props
) {
  return <GatsbyImageHydrator {...props} />
}

GatsbyImage.propTypes = propTypes

GatsbyImage.displayName = `GatsbyImage`
