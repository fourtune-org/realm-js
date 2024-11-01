import path from "node:path"
import {getPathAliases} from "../../getPathAliases.mjs"

export async function resolveImportAliases(
	fourtune_session, code, file_path
) {
	const levels = path.dirname(file_path).split(path.sep).length

	const aliases = getPathAliases(`./${"../".repeat(levels)}/`)

	const {
		jsResolveImportAliases,
		tsResolveImportAliases
	} = await fourtune_session.getDependency(
		"@fourtune/base-realm-js-and-web"
	)

	if (file_path.endsWith(".d.mts")) {
		return await tsResolveImportAliases(
			code, {aliases}
		)
	} else if (file_path.endsWith(".mts")) {
		return await jsResolveImportAliases(
			code, {aliases}
		)
	}

	return code
}
