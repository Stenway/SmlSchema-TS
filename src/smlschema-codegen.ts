/* (C) Stefan John / Stenway / SimpleML.com / 2022 */

import { SmlSchema, SsAttributeDataType, SsDefinitions, SsElementDef, SsEnumTypeDef, SsPredefinedType, SsPredefinedTypeUtil, SsRange, SsStructDef, SsStructValue, SsUnorderedAttribute, SsUnorderedContent, SsUnorderedElement, SsValueTypeDef } from "./smlschema.js";
import { IndentedStringBuilder, TsClass, TsClassMethod, TsDocument, TsEnum, TsLookup, TsUtil } from "./tscodegen.js";

// ----------------------------------------------------------------------

class TsPropertyCode {
	readonly typeName: string
	readonly initialization: string
	readonly load: string

	constructor(typeName: string, initialization: string, load: string) {
		this.typeName = typeName
		this.initialization = initialization
		this.load = load
	}
}

// ----------------------------------------------------------------------

export class SmlSchemaCodeGen {
	private readonly schema: SmlSchema
	private document: TsDocument = new TsDocument()
	private readonly typeLookup: TsLookup = new TsLookup(true)

	private utilsClass: TsClass | null = null

	constructor(schema: SmlSchema) {
		this.schema = schema
	}

	private getPredefinedTypeString(predefinedType: SsPredefinedType): string {
		switch(predefinedType) {
			case SsPredefinedType.Bool:		return "boolean"
			case SsPredefinedType.Int:		return "number"
			case SsPredefinedType.UInt:		return "number"
			case SsPredefinedType.Number:	return "number"
			case SsPredefinedType.String:	return "string"
			case SsPredefinedType.DateTime:	return "Date"
			default: throw new Error("Todo "+predefinedType)
		}
	}

	private getPredefinedTypeInitialization(predefinedType: SsPredefinedType): string {
		switch(predefinedType) {
			case SsPredefinedType.Bool:		return "false"
			case SsPredefinedType.Int:		return "0"
			case SsPredefinedType.UInt:		return "0"
			case SsPredefinedType.Number:	return "0.0"
			case SsPredefinedType.String:	return `""`
			case SsPredefinedType.DateTime:	return `new Date()`
			default: throw new Error("Todo "+predefinedType)
		}
	}

	private getValueTypeInitialization(valueTypeDef: SsValueTypeDef, typeName: string): string {
		if (valueTypeDef instanceof SsEnumTypeDef) {
			let enumTypeDef: SsEnumTypeDef = valueTypeDef as SsEnumTypeDef
			let firstValue: string = TsUtil.getIdentifier(enumTypeDef.values[0], true)
			return `${typeName}.${firstValue}`
		}
		throw new Error("Todo")
	}

	private getAttributeDataTypeString(dataType: SsAttributeDataType): string {
		if (dataType.isPredefinedType) {
			return this.getPredefinedTypeString(dataType.predefinedType!)
		} else if (dataType.isValueType) {
			return this.typeLookup.getName(dataType.valueTypeDef!)
		} else if (dataType.isStruct) {
			return this.typeLookup.getName(dataType.structDef!)
		}
		throw new Error("Todo")
	}

	private getAttributeDataTypeInitialization(dataType: SsAttributeDataType, typeName: string): string {
		if (dataType.isPredefinedType) {
			return this.getPredefinedTypeInitialization(dataType.predefinedType!)
		} else if (dataType.isValueType) {
			return this.getValueTypeInitialization(dataType.valueTypeDef!, typeName)
		} else if (dataType.isStruct) {
			return `new ${typeName}()`
		}
		throw new Error("Todo")
	}

	private getAttributeDataTypePropertyCode(dataType: SsAttributeDataType, forceNullable: boolean, asArray: boolean): TsPropertyCode {
		let elementalTypeName: string = this.getAttributeDataTypeString(dataType)
		let elementalInitialization: string = this.getAttributeDataTypeInitialization(dataType, elementalTypeName)

		let typeName: string = elementalTypeName
		let initialization: string = elementalInitialization

		if (dataType.nullable) {
			typeName += " | null"
			if (dataType.isArray) {
				typeName = "(" + typeName + ")[]"
			}
		} else {
			if (dataType.isArray) {
				typeName += "[]"
			}
		}
		if (dataType.arrayNullable || (forceNullable && ((dataType.nullable && dataType.isArray) || !dataType.nullable))) {
			typeName += " | null"
		}
		if ((!dataType.isArray && dataType.nullable) || (dataType.isArray && dataType.arrayNullable) || forceNullable) {
			initialization = "null"
		} else if (dataType.isArray) {
			initialization = "[]"
		}
		if (asArray) {
			typeName = "(" + typeName + ")[]"
			initialization = "[]"
		}
		let loadCode: string = ""
		if (dataType.isPredefinedType) {
			loadCode += "sCurAttribute.as"
			let typeNameStr: string = SsPredefinedTypeUtil.getPredefinedTypeString(dataType.predefinedType!)
			if (dataType.isArray) {
				let rangeStr: string = ""
				if (!(dataType.arrayRange!.isRepeatedPlus)) {
					rangeStr = `${dataType.arrayRange!.min}, ${dataType.arrayRange!.max}`
				}
				loadCode += `${(dataType.nullable ? "Nullable" : "")}${typeNameStr}Array(${rangeStr})`
			} else {
				loadCode += typeNameStr + "()"
			}
		} else if (dataType.isValueType) {
			loadCode = `ValueTypeUtils.as${elementalTypeName}(sCurAttribute)`
			if (dataType.isArray) { throw new Error("Todo") }
		} else {
			throw new Error("Todo")
		}
		return new TsPropertyCode(typeName, initialization, loadCode)
	}

	private generateUnorderedElement(unorderedElement: SsUnorderedElement, elementClass: TsClass, sbLoad: IndentedStringBuilder) {
		let elementName: string = unorderedElement.elementDef.name

		let elementalTypeName: string = this.typeLookup.getName(unorderedElement.elementDef)

		let typeName: string = elementalTypeName
		let initialization: string = `new ${typeName}()`

		let isOptional: boolean = unorderedElement.occurrence.isOptional
		if (isOptional) {
			typeName += " | null"
			initialization = "null"
		}
		let asArray: boolean = unorderedElement.occurrence.isRepeatedPlus || unorderedElement.occurrence.isRepeatedStar
		if (asArray) {
			elementName += "List"
			typeName = "("+typeName+")[]"
			initialization = "[]"
		}
		elementName = TsUtil.getIdentifier(elementName, false)

		let loadStr: string = `${elementalTypeName}.load(sCurElement)`
		let nameStr: string = TsUtil.escapeString(unorderedElement.elementDef.name)
		sbLoad.open("")
		if (unorderedElement.occurrence.isRequired) {
			sbLoad.appendLine(`let sCurElement: SmlElement = sElement.requiredElement(${nameStr})`)
			sbLoad.appendLine(`element.${elementName} = ${loadStr}`)
		} else if (unorderedElement.occurrence.isOptional) {
			sbLoad.appendLine(`let sCurElement: SmlElement | null = sElement.optionalElement(${nameStr})`)
			sbLoad.open(`if (sCurElement !== null)`)
			sbLoad.appendLine(`element.${elementName} = ${loadStr}`)
			sbLoad.close()
		} else {
			if (unorderedElement.occurrence.isRepeatedPlus) {
				sbLoad.open(`for (let sCurElement of sElement.oneOrMoreAttributes(${nameStr}))`)
			} else if (unorderedElement.occurrence.isRepeatedStar) {
				sbLoad.open(`for (let sCurElement of sElement.attributes(${nameStr}))`)
			} else { throw new Error() }
			sbLoad.appendLine(`element.${elementName}.push(${loadStr})`)
			sbLoad.close()
		}
		sbLoad.close()

		elementClass.addProperty(`${elementName}: ${typeName} = ${initialization}`)
	}

	private generateUnorderedAttribute(unorderedAttribute: SsUnorderedAttribute, elementClass: TsClass, sbLoad: IndentedStringBuilder) {
		let attributeName: string = unorderedAttribute.attributeDef.name

		let forceNullable: boolean = unorderedAttribute.occurrence.isOptional
		let asArray: boolean = unorderedAttribute.occurrence.isRepeatedPlus || unorderedAttribute.occurrence.isRepeatedStar
		if (asArray) {
			attributeName += "List"
		}
		attributeName = TsUtil.getIdentifier(attributeName, false)

		let code: TsPropertyCode = this.getAttributeDataTypePropertyCode(unorderedAttribute.attributeDef.dataType, forceNullable, asArray)
		
		let nameStr: string = TsUtil.escapeString(unorderedAttribute.attributeDef.name)
		sbLoad.open("")
		if (unorderedAttribute.occurrence.isRequired) {
			sbLoad.appendLine(`let sCurAttribute: SmlAttribute = sElement.requiredAttribute(${nameStr})`)
			sbLoad.appendLine(`element.${attributeName} = ${code.load}`)
		} else if (unorderedAttribute.occurrence.isOptional) {
			sbLoad.appendLine(`let sCurAttribute: SmlAttribute | null = sElement.optionalAttribute(${nameStr})`)
			sbLoad.open(`if (sCurAttribute !== null)`)
			sbLoad.appendLine(`element.${attributeName} = ${code.load}`)
			sbLoad.close()
		} else {
			if (unorderedAttribute.occurrence.isRepeatedPlus) {
				sbLoad.open(`for (let sCurAttribute of sElement.oneOrMoreAttributes(${nameStr}))`)
			} else if (unorderedAttribute.occurrence.isRepeatedStar) {
				sbLoad.open(`for (let sCurAttribute of sElement.attributes(${nameStr}))`)
			} else { throw new Error() }
			sbLoad.appendLine(`element.${attributeName}.push(${code.load})`)
			sbLoad.close()
		}
		sbLoad.close()

		elementClass.addProperty(`${attributeName}: ${code.typeName} = ${code.initialization}`)
	}

	private generateElementDef(elementDef: SsElementDef) {
		let isRootElement: boolean = this.schema.getRootElement() === elementDef
		let suffix: string = isRootElement ? "Document" : "Element"
		
		let name: string = this.typeLookup.generateName(elementDef.name + suffix)
		let elementClass: TsClass = this.document.addClass(`export class ${name}`)
		this.typeLookup.add(elementDef, name, elementClass)
		
		this.generateElements(elementDef.definitions)

		let sbLoad: IndentedStringBuilder = new IndentedStringBuilder()
		if (elementDef.content instanceof SsUnorderedContent) {
			let unorderedContent: SsUnorderedContent = elementDef.content as SsUnorderedContent
			if (unorderedContent.unorderedElements.length > 0) {
				let names: string[] = unorderedContent.unorderedElements.map((x) => x.elementDef.name)
				sbLoad.appendLine(`sElement.assureElementNames([${TsUtil.escapeStrings(names)}])`)
			} else {
				sbLoad.appendLine(`sElement.assureNoElements()`)
			}
			if (unorderedContent.unorderedAttributes.length > 0) {
				let names: string[] = unorderedContent.unorderedAttributes.map((x) => x.attributeDef.name)
				sbLoad.appendLine(`sElement.assureAttributeNames([${TsUtil.escapeStrings(names)}])`)
			} else {
				sbLoad.appendLine(`sElement.assureNoAttributes()`)
			}
			for (let unorderedElement of unorderedContent.unorderedElements) {
				this.generateUnorderedElement(unorderedElement, elementClass, sbLoad)
			}
			for (let unorderedAttribute of unorderedContent.unorderedAttributes) {
				this.generateUnorderedAttribute(unorderedAttribute, elementClass, sbLoad)
			}
		}

		elementClass.addMethod(`static load(sElement: SmlElement): ${name}`).code.
			appendLine(`sElement.assureName(${TsUtil.escapeString(elementDef.name)})`).
			appendLine(`let element: ${name} = new ${name}()`).
			appendLines(sbLoad.toString()).
			appendLine(`return element`)

		if (isRootElement) {
			elementClass.addMethod(`static parse(content: string): ${name}`).code.
				appendLine(`let sDocument: SmlDocument = SmlDocument.parse(content)`).
				appendLine(`return ${name}.load(sDocument.root)`)
		}
	}

	private generateValueType(valueTypeDef: SsValueTypeDef, definitions: SsDefinitions) {
		if (valueTypeDef instanceof SsEnumTypeDef) {
			let enumTypeDef: SsEnumTypeDef = valueTypeDef as SsEnumTypeDef
			let name: string = this.typeLookup.generateName(enumTypeDef.name + "Enum")
			let tsEnum: TsEnum = this.document.addEnum(`export enum ${name}`)
			this.typeLookup.add(enumTypeDef, name, tsEnum)
			for (let value of enumTypeDef.values) {
				tsEnum.addValue(TsUtil.getIdentifier(value, true))
			}

			let tsValueStrings: string = enumTypeDef.values.map((x) => TsUtil.escapeString(x)).join(", ")
			this.utilsClass!.addMethod(`static as${name}(sAttribute: SmlAttribute): ${name}`).code.
				appendLine(`return sAttribute.assureValueCount(1).getEnum([${tsValueStrings}])`)
		} else {
			throw new Error("TODO")
		}
	}

	private generateValueTypes(definitions: SsDefinitions) {
		for (let valueTypeDef of definitions.valueTypeDefs.values) {
			this.generateValueType(valueTypeDef, definitions)
		}

		for (let elementDef of definitions.elementDefs.values) {
			this.generateValueTypes(elementDef.definitions)
		}
	}

	private generateStructValue(value: SsStructValue, structClass: TsClass) {
		let name: string = TsUtil.getIdentifier(value.name, false)
		
		let typeName: string
		let initialization: string

		if (value.isPredefinedType) {
			typeName = this.getPredefinedTypeString(value.predefinedType!)
			initialization = this.getPredefinedTypeInitialization(value.predefinedType!)
		} else {
			typeName = this.typeLookup.getName(value.valueTypeDef!)
			initialization = this.getValueTypeInitialization(value.valueTypeDef!, typeName)
		}
		structClass.addProperty(`${name}: ${typeName} = ${initialization}`)
	}

	private generateStruct(structDef: SsStructDef, definitions: SsDefinitions) {
		let name: string = this.typeLookup.generateName(structDef.name + "Struct")
		let structClass: TsClass = this.document.addClass(`export class ${name}`)
		this.typeLookup.add(structDef, name, structClass)

		for (let value of structDef.values) {
			this.generateStructValue(value, structClass)
		}
	}

	private generateStructs(definitions: SsDefinitions) {
		for (let structDef of definitions.structDefs.values) {
			this.generateStruct(structDef, definitions)
		}

		for (let elementDef of definitions.elementDefs.values) {
			this.generateStructs(elementDef.definitions)
		}
	}

	private generateElements(definitions: SsDefinitions) {
		for (let elementDef of definitions.elementDefs.values) {
			this.generateElementDef(elementDef)
		}
	}

	private generateValueTypeUtilsClass() {
		this.utilsClass = this.document.addClass(`abstract class ValueTypeUtils`)
	}

	generate(): string {
		this.document.addImport("SmlDocument, SmlElement, SmlAttribute", "./sml.js")

		this.generateValueTypeUtilsClass()

		this.generateValueTypes(this.schema.definitions)
		this.generateStructs(this.schema.definitions)
		this.generateElements(this.schema.definitions)
		
		return this.document.toString()
	}
}