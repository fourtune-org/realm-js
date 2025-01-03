import {exportStatement} from "./exportStatement.mjs"

export function getEntryCode(fourtune_session, module_exports) {
	const {getObjectsPath} = fourtune_session.paths

	let entry_code = ``

	for (const [export_name, {source}] of module_exports.entries()) {
		if (source.endsWith(".d.mts")) continue
		if (!source.endsWith(".mts")) continue

		const extensionless_source = source.slice(0, -4)

		entry_code += exportStatement(
			getObjectsPath(`${extensionless_source + ".mjs"}`),
			export_name, false
		)
	}

	return entry_code
}
