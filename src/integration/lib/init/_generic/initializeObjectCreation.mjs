import {getTypeScriptDefinitions} from "../../getTypeScriptDefinitions.mjs"
import {addObjectFile} from "./addObjectFile.mjs"
import {isExpandableFilePath} from "@fourtune/js-and-web-runtime-and-rollup-plugins/v0/utils-api"

export async function initializeObjectCreation(fourtune_session) {
	const source_files = fourtune_session.input.getSourceFiles()
	const assets = fourtune_session.input.getAssetFiles()

	const tsc_src_input_files = []
	const tsc_assets_input_files = []

	for (const source_file of source_files) {
		if (isExpandableFilePath(source_file.name)) continue

		await addObjectFile(fourtune_session, source_file)

		if (source_file.name.endsWith(".mjs")) continue

		tsc_src_input_files.push(source_file.source)
	}

	for (const asset of assets) {
		if (!asset.name.endsWith(".mts")) continue

		await addObjectFile(fourtune_session, asset)

		tsc_assets_input_files.push(asset.source)
	}

	const {getBuildPathFromProjectRoot} = fourtune_session.paths

	fourtune_session.hooks.register(
		"createObjectFiles.pre", async () => {
			const toAbsolutePath = (file) => {
				return getBuildPathFromProjectRoot(file)
			}

			const src_map = await getTypeScriptDefinitions(
				fourtune_session,
				tsc_src_input_files.map(toAbsolutePath),
				false
			)

			const assets_map = await getTypeScriptDefinitions(
				fourtune_session,
				tsc_assets_input_files.map(toAbsolutePath),
				true
			)

			const definitions = new Map([
				...src_map,
				...assets_map
			])

			fourtune_session.user_data.tsc_definitions = definitions
		}
	)
}
