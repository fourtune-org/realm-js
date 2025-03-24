import fs from "node:fs/promises"
import {resolveImportAliases} from "../../resolveImportAliases.mjs"

async function convertTypeScriptFile(fourtune_session, code, file_path) {
	const {tsStripTypesFromCode} = fourtune_session.getDependency(
		"@fourtune/base-realm-js-and-web"
	)

	const isAsset = file_path.startsWith("assets/") || file_path.startsWith("auto/assets/")

	// only resolve import aliases for files that are not assets
	if (!isAsset) {
		// import aliases need to be resolved first because of a change
		// in @babel/preset-typescript
		code = await resolveImportAliases(
			fourtune_session, code, file_path
		)
	}

	code = await tsStripTypesFromCode(code, {
		filename: file_path,
		replace_import_extensions: true
	})

	return code
}

export async function addObjectFile(fourtune_session, input_file) {
	const {
		getBuildPath,
		getBuildPathFromProjectRoot
	} = fourtune_session.paths

	const absolute_path = getBuildPathFromProjectRoot(input_file.source)

	//
	// this applies to every realm-js package:
	//
	// - create .d.mts and .mjs file for every .mts file
	// - copy d.mts files as they are
	//
	if (input_file.name.endsWith(".d.mts")) {
		fourtune_session.objects.addObject(
			input_file.source, async () => {
				let code = (await fs.readFile(
					absolute_path
				)).toString()

				return await resolveImportAliases(
					fourtune_session, code, input_file.source
				)
			}
		)
	} else if (input_file.name.endsWith(".mts")) {
		const extensionless_file_path = input_file.source.slice(0, -4)

		fourtune_session.objects.addObject(
			`${extensionless_file_path}.mjs`, async () => {
				const code = (await fs.readFile(
					absolute_path
				)).toString()

				return await convertTypeScriptFile(
					fourtune_session, code, input_file.source
				)
			}
		)

		fourtune_session.objects.addObject(
			`${extensionless_file_path}.d.mts`, async (fourtune_session, file_path) => {
				const key = getBuildPath(file_path)

				if (fourtune_session.user_data.tsc_definitions.has(key)) {
					const code = fourtune_session.user_data.tsc_definitions.get(key)

					return await resolveImportAliases(
						fourtune_session, code, file_path
					)
				}

				return ""
			}
		)
	} else {
		fourtune_session.emitWarning(
			"src.unsupported_file", {
				relative_path: input_file.source
			}
		)
	}
}
