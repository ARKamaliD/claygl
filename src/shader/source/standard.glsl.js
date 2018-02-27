export default "\n@export clay.standard.chunk.varying\nvarying vec2 v_Texcoord;\nvarying vec3 v_Normal;\nvarying vec3 v_WorldPosition;\nvarying vec3 v_Barycentric;\n#if defined(PARALLAXOCCLUSIONMAP_ENABLED) || defined(NORMALMAP_ENABLED)\nvarying vec3 v_Tangent;\nvarying vec3 v_Bitangent;\n#endif\n#if defined(AOMAP_ENABLED)\nvarying vec2 v_Texcoord2;\n#endif\n#ifdef VERTEX_COLOR\nvarying vec4 v_Color;\n#endif\n@end\n@export clay.standard.chunk.light_header\n#ifdef AMBIENT_LIGHT_COUNT\n@import clay.header.ambient_light\n#endif\n#ifdef AMBIENT_SH_LIGHT_COUNT\n@import clay.header.ambient_sh_light\n#endif\n#ifdef AMBIENT_CUBEMAP_LIGHT_COUNT\n@import clay.header.ambient_cubemap_light\n#endif\n#ifdef POINT_LIGHT_COUNT\n@import clay.header.point_light\n#endif\n#ifdef DIRECTIONAL_LIGHT_COUNT\n@import clay.header.directional_light\n#endif\n#ifdef SPOT_LIGHT_COUNT\n@import clay.header.spot_light\n#endif\n@end\n@export clay.standard.vertex\n#define SHADER_NAME standard\nuniform mat4 worldViewProjection : WORLDVIEWPROJECTION;\nuniform mat4 worldInverseTranspose : WORLDINVERSETRANSPOSE;\nuniform mat4 world : WORLD;\nuniform vec2 uvRepeat : [1.0, 1.0];\nuniform vec2 uvOffset : [0.0, 0.0];\nattribute vec3 position : POSITION;\nattribute vec2 texcoord : TEXCOORD_0;\n#if defined(AOMAP_ENABLED)\nattribute vec2 texcoord2 : TEXCOORD_1;\n#endif\nattribute vec3 normal : NORMAL;\nattribute vec4 tangent : TANGENT;\n#ifdef VERTEX_COLOR\nattribute vec4 a_Color : COLOR;\n#endif\nattribute vec3 barycentric;\n@import clay.standard.chunk.varying\n@import clay.chunk.skinning_header\nvoid main()\n{\n    vec3 skinnedPosition = position;\n    vec3 skinnedNormal = normal;\n    vec3 skinnedTangent = tangent.xyz;\n#ifdef SKINNING\n    @import clay.chunk.skin_matrix\n    skinnedPosition = (skinMatrixWS * vec4(position, 1.0)).xyz;\n    skinnedNormal = (skinMatrixWS * vec4(normal, 0.0)).xyz;\n    skinnedTangent = (skinMatrixWS * vec4(tangent.xyz, 0.0)).xyz;\n#endif\n    gl_Position = worldViewProjection * vec4(skinnedPosition, 1.0);\n    v_Texcoord = texcoord * uvRepeat + uvOffset;\n    v_WorldPosition = (world * vec4(skinnedPosition, 1.0)).xyz;\n    v_Barycentric = barycentric;\n    v_Normal = normalize((worldInverseTranspose * vec4(skinnedNormal, 0.0)).xyz);\n#if defined(PARALLAXOCCLUSIONMAP_ENABLED) || defined(NORMALMAP_ENABLED)\n    v_Tangent = normalize((worldInverseTranspose * vec4(skinnedTangent, 0.0)).xyz);\n    v_Bitangent = normalize(cross(v_Normal, v_Tangent) * tangent.w);\n#endif\n#ifdef VERTEX_COLOR\n    v_Color = a_Color;\n#endif\n#if defined(AOMAP_ENABLED)\n    v_Texcoord2 = texcoord2;\n#endif\n}\n@end\n@export clay.standard.fragment\n#define PI 3.14159265358979\n#define GLOSSINESS_CHANNEL 0\n#define ROUGHNESS_CHANNEL 0\n#define METALNESS_CHANNEL 1\n@import clay.standard.chunk.varying\nuniform mat4 viewInverse : VIEWINVERSE;\n#ifdef NORMALMAP_ENABLED\nuniform sampler2D normalMap;\n#endif\n#ifdef DIFFUSEMAP_ENABLED\nuniform sampler2D diffuseMap;\n#endif\n#ifdef SPECULARMAP_ENABLED\nuniform sampler2D specularMap;\n#endif\n#ifdef USE_ROUGHNESS\nuniform float roughness : 0.5;\n    #ifdef ROUGHNESSMAP_ENABLED\nuniform sampler2D roughnessMap;\n    #endif\n#else\nuniform float glossiness: 0.5;\n    #ifdef GLOSSINESSMAP_ENABLED\nuniform sampler2D glossinessMap;\n    #endif\n#endif\n#ifdef METALNESSMAP_ENABLED\nuniform sampler2D metalnessMap;\n#endif\n#ifdef ENVIRONMENTMAP_ENABLED\nuniform samplerCube environmentMap;\n    #ifdef PARALLAX_CORRECTED\nuniform vec3 environmentBoxMin;\nuniform vec3 environmentBoxMax;\n    #endif\n#endif\n#ifdef BRDFLOOKUP_ENABLED\nuniform sampler2D brdfLookup;\n#endif\n#ifdef EMISSIVEMAP_ENABLED\nuniform sampler2D emissiveMap;\n#endif\n#ifdef SSAOMAP_ENABLED\nuniform sampler2D ssaoMap;\nuniform vec4 viewport : VIEWPORT;\n#endif\n#ifdef AOMAP_ENABLED\nuniform sampler2D aoMap;\nuniform float aoIntensity;\n#endif\nuniform vec3 color : [1.0, 1.0, 1.0];\nuniform float alpha : 1.0;\n#ifdef ALPHA_TEST\nuniform float alphaCutoff: 0.9;\n#endif\n#ifdef USE_METALNESS\nuniform float metalness : 0.0;\n#else\nuniform vec3 specularColor : [0.1, 0.1, 0.1];\n#endif\nuniform vec3 emission : [0.0, 0.0, 0.0];\nuniform float emissionIntensity: 1;\nuniform float lineWidth : 0.0;\nuniform vec4 lineColor : [0.0, 0.0, 0.0, 0.6];\n#ifdef ENVIRONMENTMAP_PREFILTER\nuniform float maxMipmapLevel: 5;\n#endif\n@import clay.standard.chunk.light_header\n@import clay.util.calculate_attenuation\n@import clay.util.edge_factor\n@import clay.util.rgbm\n@import clay.util.srgb\n@import clay.plugin.compute_shadow_map\n@import clay.util.parallax_correct\n@import clay.util.ACES\nfloat G_Smith(float g, float ndv, float ndl)\n{\n    float roughness = 1.0 - g;\n    float k = roughness * roughness / 2.0;\n    float G1V = ndv / (ndv * (1.0 - k) + k);\n    float G1L = ndl / (ndl * (1.0 - k) + k);\n    return G1L * G1V;\n}\nvec3 F_Schlick(float ndv, vec3 spec) {\n    return spec + (1.0 - spec) * pow(1.0 - ndv, 5.0);\n}\nfloat D_Phong(float g, float ndh) {\n    float a = pow(8192.0, g);\n    return (a + 2.0) / 8.0 * pow(ndh, a);\n}\nfloat D_GGX(float g, float ndh) {\n    float r = 1.0 - g;\n    float a = r * r;\n    float tmp = ndh * ndh * (a - 1.0) + 1.0;\n    return a / (PI * tmp * tmp);\n}\n#ifdef PARALLAXOCCLUSIONMAP_ENABLED\nuniform float parallaxOcclusionScale : 0.02;\nuniform float parallaxMaxLayers : 20;\nuniform float parallaxMinLayers : 5;\nuniform sampler2D parallaxOcclusionMap;\nmat3 transpose(in mat3 inMat)\n{\n    vec3 i0 = inMat[0];\n    vec3 i1 = inMat[1];\n    vec3 i2 = inMat[2];\n    return mat3(\n        vec3(i0.x, i1.x, i2.x),\n        vec3(i0.y, i1.y, i2.y),\n        vec3(i0.z, i1.z, i2.z)\n    );\n}\nvec2 parallaxUv(vec2 uv, vec3 viewDir)\n{\n    float numLayers = mix(parallaxMaxLayers, parallaxMinLayers, abs(dot(vec3(0.0, 0.0, 1.0), viewDir)));\n    float layerHeight = 1.0 / numLayers;\n    float curLayerHeight = 0.0;\n    vec2 deltaUv = viewDir.xy * parallaxOcclusionScale / (viewDir.z * numLayers);\n    vec2 curUv = uv;\n    float height = 1.0 - texture2D(parallaxOcclusionMap, curUv).r;\n    for (int i = 0; i < 30; i++) {\n        curLayerHeight += layerHeight;\n        curUv -= deltaUv;\n        height = 1.0 - texture2D(parallaxOcclusionMap, curUv).r;\n        if (height < curLayerHeight) {\n            break;\n        }\n    }\n    vec2 prevUv = curUv + deltaUv;\n    float next = height - curLayerHeight;\n    float prev = 1.0 - texture2D(parallaxOcclusionMap, prevUv).r - curLayerHeight + layerHeight;\n    return mix(curUv, prevUv, next / (next - prev));\n}\n#endif\nvoid main() {\n    vec4 albedoColor = vec4(color, alpha);\n#ifdef VERTEX_COLOR\n    albedoColor *= v_Color;\n#endif\n    vec3 eyePos = viewInverse[3].xyz;\n    vec3 V = normalize(eyePos - v_WorldPosition);\n    vec2 uv = v_Texcoord;\n#if defined(PARALLAXOCCLUSIONMAP_ENABLED) || defined(NORMALMAP_ENABLED)\n    mat3 tbn = mat3(v_Tangent, v_Bitangent, v_Normal);\n#endif\n#ifdef PARALLAXOCCLUSIONMAP_ENABLED\n    uv = parallaxUv(v_Texcoord, normalize(transpose(tbn) * -V));\n#endif\n#ifdef DIFFUSEMAP_ENABLED\n    vec4 texel = texture2D(diffuseMap, uv);\n    #ifdef SRGB_DECODE\n    texel = sRGBToLinear(texel);\n    #endif\n    albedoColor.rgb *= texel.rgb;\n    #ifdef DIFFUSEMAP_ALPHA_ALPHA\n    albedoColor.a *= texel.a;\n    #endif\n#endif\n#ifdef USE_METALNESS\n    float m = metalness;\n    #ifdef METALNESSMAP_ENABLED\n    float m2 = texture2D(metalnessMap, uv)[METALNESS_CHANNEL];\n    m = clamp(m2 + (m - 0.5) * 2.0, 0.0, 1.0);\n    #endif\n    vec3 baseColor = albedoColor.rgb;\n    albedoColor.rgb = baseColor * (1.0 - m);\n    vec3 spec = mix(vec3(0.04), baseColor, m);\n#else\n    vec3 spec = specularColor;\n#endif\n#ifdef USE_ROUGHNESS\n    float g = 1.0 - roughness;\n    #ifdef ROUGHNESSMAP_ENABLED\n    float g2 = 1.0 - texture2D(roughnessMap, uv)[ROUGHNESS_CHANNEL];\n    g = clamp(g2 + (g - 0.5) * 2.0, 0.0, 1.0);\n    #endif\n#else\n    float g = glossiness;\n    #ifdef GLOSSINESSMAP_ENABLED\n    float g2 = texture2D(glossinessMap, uv)[GLOSSINESS_CHANNEL];\n    g = clamp(g2 + (g - 0.5) * 2.0, 0.0, 1.0);\n    #endif\n#endif\n#ifdef SPECULARMAP_ENABLED\n    spec *= sRGBToLinear(texture2D(specularMap, uv)).rgb;\n#endif\n    vec3 N = v_Normal;\n#ifdef DOUBLE_SIDED\n    if (dot(N, V) < 0.0) {\n        N = -N;\n    }\n#endif\n#ifdef NORMALMAP_ENABLED\n    if (dot(v_Tangent, v_Tangent) > 0.0) {\n        vec3 normalTexel = texture2D(normalMap, uv).xyz;\n        if (dot(normalTexel, normalTexel) > 0.0) {            N = normalTexel * 2.0 - 1.0;\n            tbn[1] = -tbn[1];\n            N = normalize(tbn * N);\n        }\n    }\n#endif\n    vec3 diffuseTerm = vec3(0.0, 0.0, 0.0);\n    vec3 specularTerm = vec3(0.0, 0.0, 0.0);\n    float ndv = clamp(dot(N, V), 0.0, 1.0);\n    vec3 fresnelTerm = F_Schlick(ndv, spec);\n#ifdef AMBIENT_LIGHT_COUNT\n    for(int _idx_ = 0; _idx_ < AMBIENT_LIGHT_COUNT; _idx_++)\n    {{\n        diffuseTerm += ambientLightColor[_idx_];\n    }}\n#endif\n#ifdef AMBIENT_SH_LIGHT_COUNT\n    for(int _idx_ = 0; _idx_ < AMBIENT_SH_LIGHT_COUNT; _idx_++)\n    {{\n        diffuseTerm += calcAmbientSHLight(_idx_, N) * ambientSHLightColor[_idx_];\n    }}\n#endif\n#ifdef POINT_LIGHT_COUNT\n#if defined(POINT_LIGHT_SHADOWMAP_COUNT)\n    float shadowContribsPoint[POINT_LIGHT_COUNT];\n    if(shadowEnabled)\n    {\n        computeShadowOfPointLights(v_WorldPosition, shadowContribsPoint);\n    }\n#endif\n    for(int _idx_ = 0; _idx_ < POINT_LIGHT_COUNT; _idx_++)\n    {{\n        vec3 lightPosition = pointLightPosition[_idx_];\n        vec3 lc = pointLightColor[_idx_];\n        float range = pointLightRange[_idx_];\n        vec3 L = lightPosition - v_WorldPosition;\n        float dist = length(L);\n        float attenuation = lightAttenuation(dist, range);\n        L /= dist;\n        vec3 H = normalize(L + V);\n        float ndl = clamp(dot(N, L), 0.0, 1.0);\n        float ndh = clamp(dot(N, H), 0.0, 1.0);\n        float shadowContrib = 1.0;\n#if defined(POINT_LIGHT_SHADOWMAP_COUNT)\n        if(shadowEnabled)\n        {\n            shadowContrib = shadowContribsPoint[_idx_];\n        }\n#endif\n        vec3 li = lc * ndl * attenuation * shadowContrib;\n        diffuseTerm += li;\n        specularTerm += li * fresnelTerm * D_Phong(g, ndh);\n    }}\n#endif\n#ifdef DIRECTIONAL_LIGHT_COUNT\n#if defined(DIRECTIONAL_LIGHT_SHADOWMAP_COUNT)\n    float shadowContribsDir[DIRECTIONAL_LIGHT_COUNT];\n    if(shadowEnabled)\n    {\n        computeShadowOfDirectionalLights(v_WorldPosition, shadowContribsDir);\n    }\n#endif\n    for(int _idx_ = 0; _idx_ < DIRECTIONAL_LIGHT_COUNT; _idx_++)\n    {{\n        vec3 L = -normalize(directionalLightDirection[_idx_]);\n        vec3 lc = directionalLightColor[_idx_];\n        vec3 H = normalize(L + V);\n        float ndl = clamp(dot(N, L), 0.0, 1.0);\n        float ndh = clamp(dot(N, H), 0.0, 1.0);\n        float shadowContrib = 1.0;\n#if defined(DIRECTIONAL_LIGHT_SHADOWMAP_COUNT)\n        if(shadowEnabled)\n        {\n            shadowContrib = shadowContribsDir[_idx_];\n        }\n#endif\n        vec3 li = lc * ndl * shadowContrib;\n        diffuseTerm += li;\n        specularTerm += li * fresnelTerm * D_Phong(g, ndh);\n    }}\n#endif\n#ifdef SPOT_LIGHT_COUNT\n#if defined(SPOT_LIGHT_SHADOWMAP_COUNT)\n    float shadowContribsSpot[SPOT_LIGHT_COUNT];\n    if(shadowEnabled)\n    {\n        computeShadowOfSpotLights(v_WorldPosition, shadowContribsSpot);\n    }\n#endif\n    for(int i = 0; i < SPOT_LIGHT_COUNT; i++)\n    {\n        vec3 lightPosition = spotLightPosition[i];\n        vec3 spotLightDirection = -normalize(spotLightDirection[i]);\n        vec3 lc = spotLightColor[i];\n        float range = spotLightRange[i];\n        float a = spotLightUmbraAngleCosine[i];\n        float b = spotLightPenumbraAngleCosine[i];\n        float falloffFactor = spotLightFalloffFactor[i];\n        vec3 L = lightPosition - v_WorldPosition;\n        float dist = length(L);\n        float attenuation = lightAttenuation(dist, range);\n        L /= dist;\n        float c = dot(spotLightDirection, L);\n        float falloff;\n        falloff = clamp((c - a) /( b - a), 0.0, 1.0);\n        falloff = pow(falloff, falloffFactor);\n        vec3 H = normalize(L + V);\n        float ndl = clamp(dot(N, L), 0.0, 1.0);\n        float ndh = clamp(dot(N, H), 0.0, 1.0);\n        float shadowContrib = 1.0;\n#if defined(SPOT_LIGHT_SHADOWMAP_COUNT)\n        if (shadowEnabled)\n        {\n            shadowContrib = shadowContribsSpot[i];\n        }\n#endif\n        vec3 li = lc * attenuation * (1.0 - falloff) * shadowContrib * ndl;\n        diffuseTerm += li;\n        specularTerm += li * fresnelTerm * D_Phong(g, ndh);\n    }\n#endif\n    vec4 outColor = albedoColor;\n    outColor.rgb *= diffuseTerm;\n    outColor.rgb += specularTerm;\n#ifdef AMBIENT_CUBEMAP_LIGHT_COUNT\n    vec3 L = reflect(-V, N);\n    float rough2 = clamp(1.0 - g, 0.0, 1.0);\n    float bias2 = rough2 * 5.0;\n    vec2 brdfParam2 = texture2D(ambientCubemapLightBRDFLookup[0], vec2(rough2, ndv)).xy;\n    vec3 envWeight2 = spec * brdfParam2.x + brdfParam2.y;\n    vec3 envTexel2;\n    for(int _idx_ = 0; _idx_ < AMBIENT_CUBEMAP_LIGHT_COUNT; _idx_++)\n    {{\n        envTexel2 = RGBMDecode(textureCubeLodEXT(ambientCubemapLightCubemap[_idx_], L, bias2), 8.12);\n        outColor.rgb += ambientCubemapLightColor[_idx_] * envTexel2 * envWeight2;\n    }}\n#endif\n#ifdef ENVIRONMENTMAP_ENABLED\n    vec3 envWeight = g * fresnelTerm;\n    vec3 L = reflect(-V, N);\n    #ifdef PARALLAX_CORRECTED\n    L = parallaxCorrect(L, v_WorldPosition, environmentBoxMin, environmentBoxMax);\n    #endif\n    #ifdef ENVIRONMENTMAP_PREFILTER\n    float rough = clamp(1.0 - g, 0.0, 1.0);\n    float bias = rough * maxMipmapLevel;\n    vec3 envTexel = decodeHDR(textureCubeLodEXT(environmentMap, L, bias)).rgb;\n        #ifdef BRDFLOOKUP_ENABLED\n    vec2 brdfParam = texture2D(brdfLookup, vec2(rough, ndv)).xy;\n    envWeight = spec * brdfParam.x + brdfParam.y;\n        #endif\n    #else\n    vec3 envTexel = textureCube(environmentMap, L).xyz;\n    #endif\n    outColor.rgb += envTexel * envWeight;\n#endif\n    float aoFactor = 1.0;\n#ifdef SSAOMAP_ENABLED\n    aoFactor = min(texture2D(ssaoMap, (gl_FragCoord.xy - viewport.xy) / viewport.zw).r, aoFactor);\n#endif\n#ifdef AOMAP_ENABLED\n    aoFactor = min(1.0 - clamp((1.0 - texture2D(aoMap, v_Texcoord2).r) * aoIntensity, 0.0, 1.0), aoFactor);\n#endif\n    outColor.rgb *= aoFactor;\n    vec3 lEmission = emission;\n#ifdef EMISSIVEMAP_ENABLED\n    lEmission *= texture2D(emissiveMap, uv).rgb;\n#endif\n    outColor.rgb += lEmission * emissionIntensity;\n    if(lineWidth > 0.)\n    {\n        outColor.rgb = mix(outColor.rgb, lineColor.rgb, (1.0 - edgeFactor(lineWidth)) * lineColor.a);\n    }\n#ifdef ALPHA_TEST\n    if (outColor.a < alphaCutoff) {\n        discard;\n    }\n#endif\n#ifdef TONEMAPPING\n    outColor.rgb = ACESToneMapping(outColor.rgb);\n#endif\n#ifdef SRGB_ENCODE\n    outColor = linearTosRGB(outColor);\n#endif\n    gl_FragColor = encodeHDR(outColor);\n}\n@end\n@export clay.standardMR.vertex\n@import clay.standard.vertex\n@end\n@export clay.standardMR.fragment\n#define USE_METALNESS\n#define USE_ROUGHNESS\n@import clay.standard.fragment\n@end";
