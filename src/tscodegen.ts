
export class TsImport {
	readonly from: string
	readonly imports: string

	constructor(imports: string, from: string) {
		this.imports = imports
		this.from = from
	}
}

// ----------------------------------------------------------------------

export class TsDocument {
	readonly imports: TsImport[] = []
	readonly types: TsType[] = []

	addImport(imports: string, from: string) {
		this.imports.push(new TsImport(imports, from))
	}
	
	addClass(header: string): TsClass {
		let tsClass: TsClass = new TsClass(header)
		this.types.push(tsClass)
		return tsClass
	}

	addEnum(header: string): TsEnum {
		let tsEnum: TsEnum = new TsEnum(header)
		this.types.push(tsEnum)
		return tsEnum
	}

	toString(): string {
		let sb: IndentedStringBuilder = new IndentedStringBuilder()

		sb.appendLine("// This document was generated. Do not modify. Changes might be overwritten.")
		sb.appendLine()

		for (let tsImport of this.imports) {
			sb.appendLine(`import { ${tsImport.imports} } from "${tsImport.from}"`)
		}
		
		for (let tsType of this.types) {
			if (tsType instanceof TsClass) {
				let tsClass: TsClass = tsType as TsClass
				sb.appendLine()
				sb.open(tsClass.header)
				for (let property of tsClass.properties) {
					sb.appendLine(property.line)
				}
				if (tsClass.constructorImpl !== null) {
					sb.appendLine()
					sb.open(tsClass.constructorImpl.header)
					sb.appendLines(tsClass.constructorImpl.code.toString())
					sb.close()
				}
				for (let method of tsClass.methods) {
					sb.appendLine()
					sb.open(method.header)
					sb.appendLines(method.code.toString())
					sb.close()
				}
				sb.close()
			} else if (tsType instanceof TsEnum) {
				let tsEnum: TsEnum = tsType as TsEnum
				sb.appendLine()
				sb.open(tsEnum.header)
				for (let i=0; i<tsEnum.values.length; i++) {
					let commaStr: string = i === tsEnum.values.length - 1 ? "" : ","
					sb.appendLine(tsEnum.values[i]+commaStr)
				}
				sb.close()
			}
		}
		return sb.toString()
	}
}

// ----------------------------------------------------------------------

export class TsType {
	
}

// ----------------------------------------------------------------------

export class TsEnum extends TsType {
	readonly header: string

	readonly values: string[] = []

	constructor(header: string) {
		super()
		this.header = header
	}

	addValue(value: string) {
		this.values.push(value)
	}
}

// ----------------------------------------------------------------------

export class TsClass extends TsType {
	readonly header: string

	properties: TsClassProperty[] = []
	methods: TsClassMethod[] = []
	constructorImpl: TsClassConstructor | null = null

	constructor(header: string) {
		super()
		this.header = header
	}

	addMethod(header: string): TsClassMethod {
		let method: TsClassMethod = new TsClassMethod(header)
		this.methods.push(method)
		return method
	}

	addProperty(line: string): TsClassProperty {
		let property: TsClassProperty = new TsClassProperty(line)
		this.properties.push(property)
		return property
	}

	setConstructor(header: string): TsClassConstructor {
		let constructor: TsClassConstructor = new TsClassConstructor(header)
		this.constructorImpl = constructor
		return constructor
	}
}

// ----------------------------------------------------------------------

export class TsClassMethod {
	readonly header: string
	readonly code: IndentedStringBuilder = new IndentedStringBuilder()

	constructor(header: string) {
		this.header = header
	}
}

// ----------------------------------------------------------------------

export class TsClassProperty {
	readonly line: string

	constructor(line: string) {
		this.line = line
	}
}

// ----------------------------------------------------------------------

export class TsClassConstructor {
	readonly header: string

	constructor(header: string) {
		this.header = header
	}

	readonly code: IndentedStringBuilder = new IndentedStringBuilder()
}

// ----------------------------------------------------------------------

export class TsLookup {
	private readonly names: string[] = []
	private readonly nameLookup: Map<Object, string> = new Map<Object, string>()
	private readonly lookup: Map<Object, Object> = new Map<Object, Object>()

	private readonly startUpperCase: boolean

	constructor(startUpperCase: boolean) {
		this.startUpperCase = startUpperCase
	}

	generateName(name: string): string {
		if (name.length === 0) { throw new Error("Invalid name") }
		name = TsUtil.getIdentifier(name, this.startUpperCase)

		if (this.names.indexOf(name) < 0) {
			return name
		}
		for (let i=2; i<100; i++) {
			let newName: string = name + i
			if (this.names.indexOf(newName) < 0) {
				return newName
			}
		}
		throw new Error("Too many identical names")
	}

	add(source: Object, name: string, mapped: Object) {
		if (this.names.indexOf(name) >= 0) { throw new Error("Already contains name") }
		this.nameLookup.set(source, name)
		this.lookup.set(source, mapped)
		this.names.push(name)
	}

	get(source: Object): Object {
		if (!this.lookup.has(source)) { throw new Error("Does not contain source") }
		return this.lookup.get(source)!
	}

	getName(source: Object): string {
		if (!this.nameLookup.has(source)) { throw new Error("Does not contain source") }
		return this.nameLookup.get(source)!
	}
}

// ----------------------------------------------------------------------

export abstract class TsUtil {
	static escapeString(str: string): string {
		let result: string = "\""
		result += str // TODO iterate chars
		result += "\""
		return result
	}

	static escapeStrings(strings: string[]): string {
		let escaped: string[] = strings.map((s) => TsUtil.escapeString(s))
		return escaped.join(", ")
	}

	static keywords: string[] = ["public", "internal"] // TODO

	static getIdentifier(str: string, startUpperCase: boolean): string {
		let firstChar: string = str.substring(0, 1)
		str = (startUpperCase ? firstChar.toUpperCase() : firstChar.toLowerCase()) + str.substring(1)
		if (TsUtil.keywords.indexOf(str) >= 0) {
			str = "_" + str
		}
		// TODO iterate chars
		return str
	}
}

// ----------------------------------------------------------------------

export class IndentedStringBuilder {
	private text: string = ""
	private indentationLevel: number = 0
	private openingString: string = "{"
	private closingString: string = "}"
	private firstLineStack: boolean[] = [true]
	private lastWasEmpty: boolean = false

	appendLine(line: string = ""): IndentedStringBuilder {
		if (line.length === 0) {
			if (this.lastWasEmpty || this.firstLineStack[this.firstLineStack.length-1]) {
				return this
			}
			this.lastWasEmpty = true
		} else {
			this.lastWasEmpty = false
		}
		this.firstLineStack[this.firstLineStack.length-1] = false
		if (this.text !== "") { this.text += "\n" }
		this.text += "\t".repeat(this.indentationLevel) + line
		return this
	}

	appendLines(lines: string): IndentedStringBuilder {
		let lineStrings: string[] = lines.split("\n")
		for (let lineStr of lineStrings) {
			this.appendLine(lineStr)
		}
		return this
	}

	open(openingLine: string): IndentedStringBuilder {
		this.appendLine(openingLine + (openingLine === "" ? "" : " ") + this.openingString)
		this.indentationLevel++
		this.firstLineStack.push(true)
		return this
	}

	close(): IndentedStringBuilder {
		if (this.indentationLevel === 0) { throw new Error("Invalid close") }
		this.lastWasEmpty = false
		this.indentationLevel--
		this.appendLine(this.closingString)
		this.firstLineStack.pop()
		return this
	}

	closeAndOpen(line: string): IndentedStringBuilder {
		if (this.indentationLevel === 0) { throw new Error("Invalid close") }

		this.lastWasEmpty = false
		this.indentationLevel--
		this.appendLine(this.closingString + " " + line + " " + this.openingString)
		this.indentationLevel++
		this.firstLineStack[this.firstLineStack.length-1] = true
		return this
	}

	toString(): string {
		return this.text
	}
}