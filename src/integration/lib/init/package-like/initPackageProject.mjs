import {factory as f1} from "@fourtune/js-and-web-runtime-and-rollup-plugins/v0/project/rollup-plugin"
import {factory as f2} from "@fourtune/js-and-web-runtime-and-rollup-plugins/v0/runtime/rollup-plugin"
import {factory as f3} from "@fourtune/js-and-web-runtime-and-rollup-plugins/v0/assets/rollup-plugin"
import {exportStatement} from "./exportStatement.mjs"
import {getEntryCode} from "./getEntryCode.mjs"
import {isExpandableFilePath} from "@fourtune/js-and-web-runtime-and-rollup-plugins/v0/utils-api"

function getExportTypeAndName(filename) {
	if (filename.endsWith(".d.mts")) {
		return {
			type: "d.mts",
			name: filename.slice(0, -6)
		}
	} else if (filename.endsWith(".mts")) {
		return {
			type: "mts",
			name: filename.slice(0, -4)
		}
	}

	return false
}

function assetReporter(
	fourtune_session,
	assets,
	included_all_assets,
	reason
) {
	if (included_all_assets) {
		fourtune_session.emitWarning(
			`all_assets_included`, {reason}
		)
	}

	if (assets.length) {
		process.stderr.write(
			`The following assets will be included: \n\n`
		)

		for (const asset of assets) {
			process.stderr.write(
				` >    ${asset.url.padEnd(60, " ")} ${(asset.size / 1000).toFixed(1)} kBytes\n`
			)
		}

		process.stderr.write(`\n`)
	}
}

//
// crude way of fixing a bug related to rollup-plugin-dts
//
function exportNameIsType(export_name) {
	return export_name.toUpperCase().slice(0, 1) === export_name.slice(0, 1)
}

export async function initPackageProject(fourtune_session) {
	const {getObjectsPath} = fourtune_session.paths
	const output_modules = new Map()

	for (const source of fourtune_session.input.getSourceFiles()) {
		if (!source.parents.length) continue
		if (source.parents[0] !== "export") continue
		// ignore .as.mts and .as.d.mts files
		if (isExpandableFilePath(source.name)) continue

		const parsed = getExportTypeAndName(source.name)

		if (!parsed) continue

		source.parents = source.parents.slice(1)

		const export_name = parsed.name
		const module_name = source.parents.length ? source.parents.join(".") : "default"

		if (!output_modules.has(module_name)) {
			output_modules.set(module_name, new Map())
		}

		const module_exports = output_modules.get(module_name)

		if (module_exports.has(export_name)) {
			const using = module_exports.get(export_name)

			fourtune_session.emitWarning(
				`pkg.duplicate_export`, {
					module_name, export_name, using
				}
			)
		} else {
			module_exports.set(export_name, source.source)
		}
	}

	const plugin1 = await f1(fourtune_session.getProjectRoot())
	const plugin2 = await f2(fourtune_session.getProjectRoot())
	const plugin3 = await f3(fourtune_session.getProjectRoot(), (...args) => {
		assetReporter(fourtune_session,...args)
	})

	const plugins = [plugin1, plugin2, plugin3].map(plugin => {
		return {
			when: "pre",
			plugin
		}
	})

	let externals = []

	if ("external_npm_packages" in fourtune_session.getRealmOptions()) {
		externals = fourtune_session.getRealmOptions().external_npm_packages
	}

	const on_rollup_log_fn = console.log

	for (const [module_name, module_exports] of output_modules.entries()) {
		const product = fourtune_session.products.addProduct(module_name)
		const entry_code = getEntryCode(fourtune_session, module_exports)

		//
		// validate that no such files as
		// __star_export.d.mts exist
		//
		for (const [export_name, source] of module_exports) {
			if (!source.endsWith(".d.mts")) continue

			if (["__star_export", "__index", "__default"].includes(export_name)) {
				throw new Error(
					`An exported d.mts file may not be named "${export_name}.d.mts".`
				)
			}
		}

		product.addDistributable(
			"bundle", [
				"index.mjs",
				"source.mjs",
				"source.d.mts"
			], async () => {
				const {jsBundler} = fourtune_session.getDependency("@fourtune/base-realm-js-and-web")

				const code = await jsBundler(
					fourtune_session.getProjectRoot(),
					entry_code, {
						externals,
						additional_plugins: plugins,
						on_rollup_log_fn
					}
				)

				return [
					code,
					`export default ${JSON.stringify(code)};\n`,
					`declare const _default : string;\nexport default _default\n`
				]
			}
		)

		product.addDistributable(
			"bundle", [
				"index.min.mjs",
				"source.min.mjs",
				"source.min.d.mts"
			], async () => {
				const {jsBundler} = fourtune_session.getDependency("@fourtune/base-realm-js-and-web")

				const code = await jsBundler(
					fourtune_session.getProjectRoot(),
					entry_code, {
						externals,
						additional_plugins: plugins,
						minify: true,
						on_rollup_log_fn
					}
				)

				return [
					code,
					`export default ${JSON.stringify(code)};\n`,
					`declare const _default : string;\nexport default _default\n`
				]
			}
		)

		product.addDistributable(
			"types", [
				"index.d.mts",
				"index.min.d.mts",
				"ModuleExport.d.mts"
			], async () => {
				const {tsTypeDeclarationBundler} = fourtune_session.getDependency("@fourtune/base-realm-js-and-web")
				let entry_code = ``
				let exported_symbols = []

				for (const [export_name, source] of module_exports.entries()) {
					let source_path = source

					// d.mts files will never have an export name of
					// __star_export, __index or __default
					if (source.endsWith(".d.mts")) {
						entry_code += exportStatement(
							getObjectsPath(source), export_name, exportNameIsType(export_name)
						)

						exported_symbols.push({
							name: export_name,
							is_type_only: true,
							type_source: getObjectsPath(source)
						})
					} else if (source.endsWith(".mts")) {
						const extensionless_source = source.slice(0, -4)
						source_path = getObjectsPath(`${extensionless_source}.d.mts`)

						entry_code += exportStatement(source_path, export_name, exportNameIsType(export_name))

						// __star_export and __index
						// both can have an arbitrary amount of named
						// exports so we first have to de-star them
						// (we could do this with every export but
						//  it's an expensive operation)
						if (export_name === "__star_export" || export_name === "__index") {
							for (const name of await getExportNames(source_path)) {
								exported_symbols.push({
									name,
									is_type_only: false,
									type_source: source_path
								})
							}
						} else {
							exported_symbols.push({
								name: export_name === "__default" ? "default" : export_name,
								is_type_only: false,
								type_source: source_path
							})
						}
					}
				}

				let entry_code_2 = ``

				for (const symbol of exported_symbols) {
					if (symbol.name !== "default") {
						entry_code_2 += `import type {${symbol.name}} from "${symbol.type_source}"\n`
					} else {
						entry_code_2 += `import type __default_import from "${symbol.type_source}"\n`
					}
				}

				entry_code_2 += `\n`
				entry_code_2 += `export type ModuleExport = {\n`

				for (const symbol of exported_symbols) {
					if (symbol.is_type_only) {
						entry_code_2 += `    ${symbol.name}: ${symbol.name},\n`
					} else {
						if (symbol.name === "default") {
							entry_code_2 += `    ${symbol.name}: typeof __default_import,\n`
						} else {
							entry_code_2 += `    ${symbol.name}: typeof ${symbol.name},\n`
						}
					}
				}

				entry_code_2 += `}\n`

				const index_dmts = await tsTypeDeclarationBundler(
					fourtune_session.getProjectRoot(),
					entry_code, {
						externals,
						on_rollup_log_fn
					}
				)

				return [
					index_dmts,
					index_dmts,
					await tsTypeDeclarationBundler(
						fourtune_session.getProjectRoot(),
						entry_code_2, {
							externals,
							on_rollup_log_fn
						}
					)
				]

				async function getExportNames(source) {
					const {
						parseCode,
						getExportNames
					} = fourtune_session.getDependency("@aniojs/node-ts-utils")

					const code = parseCode(
						await tsTypeDeclarationBundler(
							fourtune_session.getProjectRoot(),
							`export type * from "${source}"`,
							{
								externals,
								on_rollup_log_fn
							}
						)
					)

					return getExportNames(code)
				}
			}
		)
	}
}
