import * as S from "@effect/schema/Schema"

/**
 * Middleware is inactivate by default, the Key is optional in route context, and the service is optionally provided as Effect Context.
 * Unless configured as `true`
 */
export type ContextMap<Key, Service, E> = [Key, Service, E, true]

export type ContextMapCustom<Key, Service, E, Custom> = [Key, Service, E, Custom]

/**
 * Middleware is active by default, and provides the Service at Key in route context, and the Service is provided as Effect Context.
 * Unless omitted
 */
export type ContextMapInverted<Key, Service, E> = [Key, Service, E, false]

type Values<T extends Record<any, any>> = T[keyof T]

export type GetEffectContext<CTXMap extends Record<string, [string, any, S.Schema.All, any]>, T> = Values<
  // inverted
  & {
    [
      key in keyof CTXMap as CTXMap[key][3] extends true ? never
        : key extends keyof T ? T[key] extends true ? never : CTXMap[key][0]
        : CTXMap[key][0]
    ]: // TODO: or as an Optional available?
      CTXMap[key][1]
  }
  // normal
  & {
    [
      key in keyof CTXMap as CTXMap[key][3] extends false ? never
        : key extends keyof T ? T[key] extends true ? CTXMap[key][0] : never
        : never
    ]: // TODO: or as an Optional available?
      CTXMap[key][1]
  }
>
export type ValuesOrNeverSchema<T extends Record<any, any>> = Values<T> extends never ? typeof S.Never : Values<T>
export type GetEffectError<CTXMap extends Record<string, [string, any, S.Schema.All, any]>, T> = Values<
  // inverted
  & {
    [
      key in keyof CTXMap as CTXMap[key][3] extends true ? never
        : key extends keyof T ? T[key] extends true ? never : CTXMap[key][0]
        : CTXMap[key][0]
    ]: // TODO: or as an Optional available?
      CTXMap[key][2]
  }
  // normal
  & {
    [
      key in keyof CTXMap as CTXMap[key][3] extends false ? never
        : key extends keyof T ? T[key] extends true ? CTXMap[key][0] : never
        : never
    ]: // TODO: or as an Optional available?
      CTXMap[key][2]
  }
>

type GetFailure1<F1> = F1 extends S.Schema.Any ? F1 : typeof S.Never
type GetFailure<F1, F2> = F1 extends S.Schema.Any ? F2 extends S.Schema.Any ? S.Union<[F1, F2]> : F1 : F2

const merge = (a: any, b: Array<any>) =>
  a !== undefined && b.length ? S.Union(a, ...b) : a !== undefined ? a : b.length ? S.Union(...b) : S.Never

export const makeRpcClient = <
  RequestConfig extends object,
  CTXMap extends Record<string, [string, any, S.Schema.All, any]>
>(
  errors: { [K in keyof CTXMap]: S.Schema.Any }
) => {
  // Long way around Context/C extends etc to support actual jsdoc from passed in RequestConfig etc...
  type Context = { success: S.Schema.Any; failure: S.Schema.Any }
  function TaggedRequest<Self>(): {
    <Tag extends string, Payload extends S.Struct.Fields, C extends Context>(
      tag: Tag,
      fields: Payload,
      config: RequestConfig & C
    ):
      & S.TaggedRequestClass<
        Self,
        Tag,
        { readonly _tag: S.tag<Tag> } & Payload,
        typeof config["success"],
        GetEffectError<CTXMap, C> extends never ? typeof config["failure"] :
          GetFailure<typeof config["failure"], GetEffectError<CTXMap, C>>
      > // typeof config["failure"]
      & { config: Omit<C, "success" | "failure"> }
    <Tag extends string, Payload extends S.Struct.Fields, C extends { success: S.Schema.Any }>(
      tag: Tag,
      fields: Payload,
      config: RequestConfig & C
    ):
      & S.TaggedRequestClass<
        Self,
        Tag,
        { readonly _tag: S.tag<Tag> } & Payload,
        typeof config["success"],
        GetFailure1<GetEffectError<CTXMap, C>>
      >
      & { config: Omit<C, "success" | "failure"> }
    <Tag extends string, Payload extends S.Struct.Fields, C extends { failure: S.Schema.Any }>(
      tag: Tag,
      fields: Payload,
      config: RequestConfig & C
    ):
      & S.TaggedRequestClass<
        Self,
        Tag,
        { readonly _tag: S.tag<Tag> } & Payload,
        typeof S.Void,
        GetFailure1<GetEffectError<CTXMap, C>>
      >
      & { config: Omit<C, "success" | "failure"> }
    <Tag extends string, Payload extends S.Struct.Fields, C extends Record<string, any>>(
      tag: Tag,
      fields: Payload,
      config: C & RequestConfig
    ):
      & S.TaggedRequestClass<
        Self,
        Tag,
        { readonly _tag: S.tag<Tag> } & Payload,
        typeof S.Void,
        GetFailure1<GetEffectError<CTXMap, C>>
      >
      & { config: Omit<C, "success" | "failure"> }
    <Tag extends string, Payload extends S.Struct.Fields>(
      tag: Tag,
      fields: Payload
    ): S.TaggedRequestClass<
      Self,
      Tag,
      { readonly _tag: S.tag<Tag> } & Payload,
      typeof S.Void,
      typeof S.Never
    >
  } {
    // TODO: filter errors based on config + take care of inversion
    const errorSchemas = Object.values(errors)
    return (<Tag extends string, Fields extends S.Struct.Fields, C extends Context>(
      tag: Tag,
      fields: Fields,
      config?: C
    ) => {
      const req = S.TaggedRequest<Self>()(tag, {
        payload: fields,
        failure: merge(config?.failure, errorSchemas),
        success: config?.success ?? S.Void
      })
      const req2 = Object.assign(req, { config })
      return req2
    }) as any
  }

  return {
    TaggedRequest
  }
}
