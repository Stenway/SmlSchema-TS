/* (C) Stefan John / Stenway / SimpleML.com / 2022 */

import { SmlDocument, SmlElement, SmlAttribute } from "./sml.js"

// ----------------------------------------------------------------------

export class SmlSchema {
	readonly definitions: SsDefinitions
	private _rootElement: SsElementDef | null = null
	
	constructor() {
		this.definitions = new SsDefinitions(null, null)
	}

	getRootElement(): SsElementDef {
		if (this._rootElement === null) { throw new Error("Root element not set") }
		return this._rootElement
	}

	setRootElementByName(name: string) {
		this._rootElement = this.definitions.elementDefs.get(name)
	}

	setRootElementDefault() {
		if (this.definitions.elementDefs.values.length > 1) { throw new Error("Cannot set default root element because the schema contains multiple ElementDefs at root level") }
		this._rootElement = this.definitions.elementDefs.values[0]
	}

	static parse(content: string): SmlSchema {
		return new SmlSchemaLoader().parse(content)
	}

	serialize(): SmlDocument {
		return SmlSchemaSerializer.serialize(this)
	}

	toString(): string {
		return this.serialize().toString()
	}
}

// ----------------------------------------------------------------------

export class SsDefinitionList<T> {
	private readonly map: Map<string,T> = new Map<string,T>()

	private readonly parentList: SsDefinitionList<T> | null
	private readonly typeDescription: string
	private readonly selfDescription: string
	private readonly newFunction: (name: string) => T

	get values(): T[] {
		return Array.from(this.map.values())
	}

	constructor(parentList: SsDefinitionList<T> | null, typeDescription: string, selfDescription: string, newFunction: (name: string) => T) {
		this.parentList = parentList
		this.typeDescription = typeDescription
		this.selfDescription = selfDescription
		this.newFunction = newFunction
	}

	has(name: string): boolean {
		if (this.map.has(name)) { return true }
		if (this.parentList === null) { return false }
		return this.parentList.has(name)
	}

	getOrNull(name: string): T | null {
		if (this.map.has(name)) { return this.map.get(name)! }
		if (this.parentList === null) { return null }
		return this.parentList.getOrNull(name)
	}

	get(name: string): T {
		let item: T | null = this.getOrNull(name)
		if (item === null) { throw new Error(`${this.typeDescription} "${name}" not defined in ${this.selfDescription}`) }
		return item
	}

	add(name: string): T {
		if (this.map.has(name)) { throw new Error(`${this.typeDescription} "${name}" already exists in ${this.selfDescription}`) }
		let item: T = this.newFunction(name)
		this.map.set(name, item)
		return item
	}

	addExisting(name: string, item: T): T {
		if (this.map.has(name)) { throw new Error(`${this.typeDescription} "${name}" already exists in ${this.selfDescription}`) }
		this.map.set(name, item)
		return item
	}
}

// ----------------------------------------------------------------------

export class SsDefinitions {
	readonly valueTypeDefs: SsDefinitionList<SsValueTypeDef>
	readonly structDefs: SsDefinitionList<SsStructDef>
	readonly attributeDefs: SsDefinitionList<SsAttributeDef>
	readonly elementDefs: SsDefinitionList<SsElementDef>
	
	private readonly ownerElementDef: SsElementDef | null
	
	constructor(ownerElementDef: SsElementDef | null, parentDefinitions: SsDefinitions | null) {
		this.ownerElementDef = ownerElementDef
		
		let selfDescription: string = this.ownerElementDef === null ? "schema" : `ElementDef "${this.ownerElementDef.name}"`
		this.valueTypeDefs = new SsDefinitionList<SsValueTypeDef>(parentDefinitions === null ? null : parentDefinitions.valueTypeDefs, "ValueTypeDef", selfDescription, (name: string): SsValueTypeDef => { throw new Error("Not supported") } )
		this.structDefs = new SsDefinitionList<SsStructDef>(parentDefinitions === null ? null : parentDefinitions.structDefs, "StructDef", selfDescription, (name: string): SsStructDef => { return new SsStructDef(name, this) } )
		this.attributeDefs = new SsDefinitionList<SsAttributeDef>(parentDefinitions === null ? null : parentDefinitions.attributeDefs, "AttributeDef", selfDescription, (name: string): SsAttributeDef => { return new SsAttributeDef(name, this) } )
		this.elementDefs = new SsDefinitionList<SsElementDef>(parentDefinitions === null ? null : parentDefinitions.elementDefs, "ElementDef", selfDescription, (name: string): SsElementDef => { return new SsElementDef(name, this) } )
	}

	addEnum(name: string, values: string[]) {
		let enumTypeDef: SsEnumTypeDef = new SsEnumTypeDef(name, values)
		this.valueTypeDefs.addExisting(name, enumTypeDef)
	}
}

// ----------------------------------------------------------------------

export class SsRange {
	readonly min: number | null
	readonly max: number | null

	constructor(min: number | null, max: number | null) {
		if (min !== null && max !== null && max < min) { throw new Error("Invalid bounds") }
		this.min = min
		this.max = max
	}

	get isRequired(): boolean {
		return this.min !== null && this.max !== null && this.min === 1 && this.max === 1
	}

	get isOptional(): boolean {
		return this.min !== null && this.max !== null && this.min === 0 && this.max === 1
	}

	get isRepeatedPlus(): boolean {
		return this.min !== null && this.min === 1 && this.max === null
	}

	get isRepeatedStar(): boolean {
		return ((this.min !== null && this.min === 0) || this.min === null) && this.max === null
	}

	get isFixed(): boolean {
		return this.min !== null && this.max !== null && this.min === this.max
	}

	static required(): SsRange {
		return new SsRange(1, 1)
	}

	static optional(): SsRange {
		return new SsRange(0, 1)
	}

	static repeatedPlus(): SsRange {
		return new SsRange(1, null)
	}

	static repeatedStar(): SsRange {
		return new SsRange(null, null)
	}

	static fixed(size: number): SsRange {
		return new SsRange(size, size)
	}
}

// ----------------------------------------------------------------------

export class SsElementDef {
	readonly definitions: SsDefinitions
	readonly name: string
	private _content: SsElementContent | null = null

	get content(): SsElementContent | null {
		return this._content
	}

	get isUnordered(): boolean {
		return this._content !== null && this._content instanceof SsUnorderedContent
	}

	constructor(name: string, parentDefinitions: SsDefinitions) {
		this.name = name
		this.definitions = new SsDefinitions(this, parentDefinitions)
	}

	setUnorderedContent(): SsUnorderedContent {
		let unorderedContent: SsUnorderedContent = new SsUnorderedContent(this)
		this._content = unorderedContent
		return unorderedContent
	}
}

// ----------------------------------------------------------------------

export abstract class SsElementContent {
	readonly elementDef: SsElementDef

	constructor(elementDef: SsElementDef) {
		this.elementDef = elementDef
	}
}

// ----------------------------------------------------------------------

export class SsUnorderedContent extends SsElementContent {
	private readonly _elements: Map<String, SsUnorderedElement> = new Map<String, SsUnorderedElement>()
	private readonly _attributes: Map<String, SsUnorderedAttribute> = new Map<String, SsUnorderedAttribute>()

	get unorderedElements(): SsUnorderedElement[] {
		return Array.from(this._elements.values())
	}

	get unorderedAttributes(): SsUnorderedAttribute[] {
		return Array.from(this._attributes.values())
	}

	constructor(elementDef: SsElementDef) {
		super(elementDef)
	}

	addElement(elementName: string, occurrence: SsRange) {
		if (this._elements.has(elementName)) { throw new Error(`Element "${this.elementDef.name}" already contains an unordered element with name "${elementName}"`) }
		let childElementDef: SsElementDef = this.elementDef.definitions.elementDefs.get(elementName)
		let unorderedElement: SsUnorderedElement = new SsUnorderedElement(childElementDef, occurrence)
		this._elements.set(elementName, unorderedElement)
	}

	addAttribute(attributeName: string, occurrence: SsRange) {
		if (this._attributes.has(attributeName)) { throw new Error(`Element "${this.elementDef.name}" already contains an unordered attribute with name "${attributeName}"`) }
		let childAttributeDef: SsAttributeDef = this.elementDef.definitions.attributeDefs.get(attributeName)
		let unorderedAttribute: SsUnorderedAttribute = new SsUnorderedAttribute(childAttributeDef, occurrence, false)
		this._attributes.set(attributeName, unorderedAttribute)
	}

	addInlineAttribute(inlineAttributeDef: SsAttributeDef, occurrence: SsRange) {
		if (this._attributes.has(inlineAttributeDef.name)) { throw new Error(`Element "${this.elementDef.name}" already contains an unordered attribute with name "${inlineAttributeDef.name}"`) }
		let unorderedAttribute: SsUnorderedAttribute = new SsUnorderedAttribute(inlineAttributeDef, occurrence, true)
		this._attributes.set(inlineAttributeDef.name, unorderedAttribute)
	}
}

// ----------------------------------------------------------------------

export class SsUnorderedElement {
	readonly elementDef: SsElementDef
	readonly occurrence: SsRange

	constructor(elementDef: SsElementDef, occurrence: SsRange) {
		this.elementDef = elementDef
		this.occurrence = occurrence
	}
}

// ----------------------------------------------------------------------

export class SsUnorderedAttribute {
	readonly attributeDef: SsAttributeDef
	readonly occurrence: SsRange
	readonly inline: boolean

	constructor(attributeDef: SsAttributeDef, occurrence: SsRange, inline: boolean) {
		this.attributeDef = attributeDef
		this.occurrence = occurrence
		this.inline = inline
	}
}

// ----------------------------------------------------------------------

export class SsOrderedContent extends SsElementContent {
	constructor(elementDef: SsElementDef) {
		super(elementDef)
	}
}

// ----------------------------------------------------------------------

export class SsAttributeDataType {
	readonly predefinedType: SsPredefinedType | null
	readonly valueTypeDef: SsValueTypeDef | null
	readonly structDef: SsStructDef | null

	readonly nullable: boolean
	readonly arrayRange: SsRange | null
	readonly arrayNullable: boolean

	get isPredefinedType(): boolean {
		return this.predefinedType !== null
	}

	get isValueType(): boolean {
		return this.valueTypeDef !== null
	}

	get isStruct(): boolean {
		return this.structDef !== null
	}

	get isArray(): boolean {
		return this.arrayRange !== null
	}
	
	constructor(predefinedType: SsPredefinedType | null, valueTypeDef: SsValueTypeDef | null, structDef: SsStructDef | null,
		nullable: boolean, arrayRange: SsRange | null, arrayNullable: boolean) {
		if (predefinedType !== null && (valueTypeDef !== null || structDef !== null)) { throw new Error() }
		if (valueTypeDef !== null && (predefinedType !== null || structDef !== null)) { throw new Error() }
		if (structDef !== null && (predefinedType !== null || valueTypeDef !== null)) { throw new Error() }
		if (structDef === null && predefinedType === null && valueTypeDef === null) { throw new Error() }

		this.predefinedType = predefinedType
		this.valueTypeDef = valueTypeDef
		this.structDef = structDef

		this.nullable = nullable
		this.arrayRange = arrayRange
		if (arrayRange === null && arrayNullable === true) { throw new Error() }
		this.arrayNullable = arrayNullable
		if (this.isArray && this.isStruct && this.structDef!.hasOptional) { throw new Error(`Array of struct "${this.structDef!.name}" with optional values not allowed`) }
	}

	toString(): string {
		let typeName: string
		if (this.predefinedType !== null) { typeName = SsPredefinedTypeUtil.getPredefinedTypeString(this.predefinedType) }
		else if (this.valueTypeDef !== null) { typeName = this.valueTypeDef.name }
		else { typeName = this.structDef!.name }
		if (this.nullable) { typeName += "?" }
		if (this.arrayRange !== null) {
			let arrayRangeStr: string = ""+this.arrayRange.min
			if (!this.arrayRange.isFixed) {
				arrayRangeStr += ".." + (this.arrayRange.max === null ? "N" : this.arrayRange.max)
			}
			typeName += "["+arrayRangeStr+"]"
		}
		if (this.arrayNullable) { typeName += "?" }
		return typeName
	}
}

// ----------------------------------------------------------------------

export class SsAttributeDef {
	private readonly definitions: SsDefinitions
	readonly name: string

	private _dataType: SsAttributeDataType | null = null
	
	get dataType(): SsAttributeDataType {
		if (this._dataType === null) { throw new Error("Data type not set") }
		return this._dataType
	}

	set dataType(value: SsAttributeDataType) {
		if (this._dataType !== null) { throw new Error("Data type already set") }
		this._dataType = value
	}

	constructor(name: string, definitions: SsDefinitions) {
		this.definitions = definitions
		this.name = name
	}
}

// ----------------------------------------------------------------------

export enum SsPredefinedType {
	Bool,
	Int,
	UInt,
	Number,
	String,
	Date,
	Time,
	Base64,

	DateTime
}

// ----------------------------------------------------------------------

export abstract class SsPredefinedTypeUtil {
	static getPredefinedTypeOrNull(str: string): SsPredefinedType | null {
		str = str.toLowerCase()
		switch (str) {
			case "bool": return SsPredefinedType.Bool
			case "int": return SsPredefinedType.Int
			case "uint": return SsPredefinedType.UInt
			case "number": return SsPredefinedType.Number
			case "string": return SsPredefinedType.String
			case "date": return SsPredefinedType.Date
			case "time": return SsPredefinedType.Time
			case "base64": return SsPredefinedType.Base64
			case "datetime": return SsPredefinedType.DateTime
			default: return null
		}
	}

	static getPredefinedTypeString(predefinedType: SsPredefinedType): string {
		switch(predefinedType) {
			case SsPredefinedType.Bool: return "Bool"
			case SsPredefinedType.Int: return "Int"
			case SsPredefinedType.UInt: return "UInt"
			case SsPredefinedType.Number: return "Number"
			case SsPredefinedType.String: return "String"
			case SsPredefinedType.Date: return "Date"
			case SsPredefinedType.Time: return "Time"
			case SsPredefinedType.DateTime: return "DateTime"
		}
		throw new Error("Invalid predefined type string")
	}
}

// ----------------------------------------------------------------------

export abstract class SsValueTypeDef {
	readonly name: string
	
	constructor(name: string) {
		this.name = name
	}
}

// ----------------------------------------------------------------------

export class SsEnumTypeDef extends SsValueTypeDef {
	private readonly _values: string[]

	get values(): string[] {
		return [...this._values]
	}

	constructor(name: string, values: string[]) {
		super(name)
		this._values = values
	}
}

// ----------------------------------------------------------------------

export class SsStringTypeDef extends SsValueTypeDef {
	
	constructor(name: string) {
		super(name)
	}
}

// ----------------------------------------------------------------------

export class SsNumberTypeDef extends SsValueTypeDef {
	
	constructor(name: string) {
		super(name)
	}
}

// ----------------------------------------------------------------------

export class SsStructDef {
	private readonly definitions: SsDefinitions
	readonly name: string

	private readonly _values: SsStructValue[] = []

	get values(): SsStructValue[] {
		return [...this._values]
	}

	get hasOptional(): boolean {
		return this._values.find((x) => x.optional) !== undefined
	}
	
	constructor(name: string, definitions: SsDefinitions) {
		this.definitions = definitions
		this.name = name
	}

	addValue(name: string, optional: boolean, predefinedType: SsPredefinedType | null, valueTypeDef: SsValueTypeDef | null, nullable: boolean) {
		let value: SsStructValue = new SsStructValue(name, optional, predefinedType, valueTypeDef, nullable)
		if (this._values.length > 0) {
			let lastOptional: boolean = this._values[this._values.length-1].optional
			if (!optional && lastOptional) { throw new Error("Value is not optional but value before was optional") }
		}
		this._values.push(value)
	}
}

// ----------------------------------------------------------------------

export class SsStructValue {
	readonly name: string
	readonly optional: boolean
	readonly predefinedType: SsPredefinedType | null
	readonly valueTypeDef: SsValueTypeDef | null
	readonly nullable: boolean

	get isPredefinedType(): boolean {
		return this.predefinedType !== null
	}

	constructor(name: string, optional: boolean, predefinedType: SsPredefinedType | null, valueTypeDef: SsValueTypeDef | null, nullable: boolean) {
		this.name = name
		this.optional = optional
		this.predefinedType = predefinedType
		this.valueTypeDef = valueTypeDef
		this.nullable = nullable
	}

	getTypeString(): string {
		let typeName: string
		if (this.predefinedType !== null) { typeName = SsPredefinedTypeUtil.getPredefinedTypeString(this.predefinedType) }
		else { typeName = this.valueTypeDef!.name }
		if (this.nullable) { typeName += "?" }
		return typeName
	}
}

// ----------------------------------------------------------------------

class SmlSchemaLoader {
	private schema: SmlSchema = new SmlSchema()

	constructor() {

	}

	private static getOccurrence(sAttribute: SmlAttribute, index: number): SsRange {
		let occurrenceIndex: number = sAttribute.getEnum(["Required", "Optional", "Repeated+", "Repeated*"], index)
		let occurrence: SsRange
		if (occurrenceIndex === 0) { occurrence = SsRange.required() }
		else if (occurrenceIndex === 1) { occurrence = SsRange.optional() }
		else if (occurrenceIndex === 2) { occurrence = SsRange.repeatedPlus() }
		else if (occurrenceIndex === 3) { occurrence = SsRange.repeatedStar() }
		else { throw new Error("Could not get occurrence") }
		return occurrence
	}

	private static loadDataType(dataTypeStr: string, definitions: SsDefinitions): SsAttributeDataType {
		let arrayNullable: boolean = false
		if (dataTypeStr.endsWith("]?")) {
			arrayNullable = true
			dataTypeStr = dataTypeStr.substring(0, dataTypeStr.length-1)
		}
		let arrayBounds: SsRange | null = null
		if (dataTypeStr.endsWith("]")) {
			let splitIndex: number = dataTypeStr.indexOf("[")
			if (splitIndex < 0) { throw new Error("Invalid data type") }
			let arrayBoundsStr: string = dataTypeStr.substring(splitIndex+1, dataTypeStr.length-1)
			dataTypeStr = dataTypeStr.substring(0, splitIndex)
			if (arrayBoundsStr.includes("..")) {
				let parts: string[] = arrayBoundsStr.split("..", 2)
				let minSize: number = Number.parseInt(parts[0])
				let maxSize: number | null = null
				if (parts[1].toUpperCase() !== "N") {
					maxSize = Number.parseInt(parts[1])
				}
				arrayBounds = new SsRange(minSize, maxSize)
			} else {
				let fixedSize: number = Number.parseInt(arrayBoundsStr)
				if (fixedSize < 0) { throw new Error("Invalid array size") }
				arrayBounds = SsRange.fixed(fixedSize)
			}
		}
		let nullable: boolean = false
		if (dataTypeStr.endsWith("?")) {
			nullable = true
			dataTypeStr = dataTypeStr.substring(0, dataTypeStr.length-1)
		}
		let predefinedType: SsPredefinedType | null = SsPredefinedTypeUtil.getPredefinedTypeOrNull(dataTypeStr)
		let valueTypeDef: SsValueTypeDef | null = null
		if (predefinedType === null) {
			valueTypeDef = definitions.valueTypeDefs.getOrNull(dataTypeStr)
		}
		let structDef: SsStructDef | null = null
		if (predefinedType === null && valueTypeDef === null) {
			structDef = definitions.structDefs.get(dataTypeStr)
		}
		return new SsAttributeDataType(predefinedType, valueTypeDef, structDef, nullable, arrayBounds, arrayNullable)
	}

	private loadElementDef(sElementDef: SmlElement, elementDef: SsElementDef) {
		sElementDef.assureElementNames(["Definitions", "UnorderedContent", "ListContent"])
		sElementDef.assureAttributeNames(["Name"])

		let sDefinitionsElement: SmlElement | null = sElementDef.optionalElement("Definitions")
		if (sDefinitionsElement !== null) {
			sDefinitionsElement.assureElementNames(["EnumType", "Struct", "Attribute", "Element"])
			sDefinitionsElement.assureNoAttributes()
			this.loadDefinitions(sDefinitionsElement, elementDef.definitions)
		}
		
		sElementDef.assureChoice(["UnorderedContent", "ListContent"], null, true)
		if (sElementDef.hasElement("ListContent")) {
			throw new Error("Todo")
		} else if (sElementDef.hasElement("UnorderedContent")) {
			let unorderedContent: SsUnorderedContent = elementDef.setUnorderedContent()
			let sUnorderedContentElement: SmlElement = sElementDef.optionalElement("UnorderedContent")!
			for (let sElementAttribute of sUnorderedContentElement.attributes("Element")) {
				sElementAttribute.assureValueCount(2)
				let elementName: string = sElementAttribute.getString(0)
				let occurrence: SsRange = SmlSchemaLoader.getOccurrence(sElementAttribute, 1)
				unorderedContent.addElement(elementName, occurrence)
			}
			for (let sAttributeAttribute of sUnorderedContentElement.attributes("Attribute")) {
				sAttributeAttribute.assureValueCountMinMax(2, 3)
				let attributeName: string = sAttributeAttribute.getString(0)
				let occurrence: SsRange = SmlSchemaLoader.getOccurrence(sAttributeAttribute, 1)
				if (sAttributeAttribute.valueCount === 2) {
					unorderedContent.addAttribute(attributeName, occurrence)
				} else {
					let inlineAttributeDef: SsAttributeDef = new SsAttributeDef(attributeName, elementDef.definitions)
					let dataTypeStr: string = sAttributeAttribute.getString(2)
					inlineAttributeDef.dataType = SmlSchemaLoader.loadDataType(dataTypeStr, elementDef.definitions)
					unorderedContent.addInlineAttribute(inlineAttributeDef, occurrence)
				}
			}
		}
	}

	private loadStructValue(sValueAttribute: SmlAttribute, structDef: SsStructDef, definitions: SsDefinitions) {
		sValueAttribute.assureValueCount(3)
		let valueName: string = sValueAttribute.getString(0)
		let optional: boolean = sValueAttribute.getEnum(["Required", "Optional"], 1) === 1
		let typeStr: string = sValueAttribute.getString(2)

		let nullable: boolean = false
		if (typeStr.endsWith("?")) {
			nullable = true
			typeStr = typeStr.substring(0, typeStr.length-1)
		}
		let predefinedType: SsPredefinedType | null = SsPredefinedTypeUtil.getPredefinedTypeOrNull(typeStr)
		let valueTypeDef: SsValueTypeDef | null = null
		if (predefinedType === null) {
			valueTypeDef = definitions.valueTypeDefs.get(typeStr)
		}

		structDef.addValue(valueName, optional, predefinedType, valueTypeDef, nullable)
	}

	private loadEnumTypeDef(sEnumTypeDef: SmlElement, definitions: SsDefinitions) {
		sEnumTypeDef.assureNoElements()
		sEnumTypeDef.assureAttributeNames(["Name", "Values"])

		let name: string = sEnumTypeDef.requiredAttribute("Name").asString()
		let values: string[] = sEnumTypeDef.requiredAttribute("Values").asStringArray()
		definitions.addEnum(name, values)
	}

	private loadDefinitions(sElement: SmlElement, definitions: SsDefinitions) {
		for (let sEnumTypeDef of sElement.elements("EnumType")) {
			this.loadEnumTypeDef(sEnumTypeDef, definitions)
		}
		for (let sStructDef of sElement.elements("Struct")) {
			let name: string = sStructDef.requiredAttribute("Name").asString()
			let structDef: SsStructDef = definitions.structDefs.add(name)
			for (let sValueAttribute of sStructDef.attributes("Value")) {
				this.loadStructValue(sValueAttribute, structDef, definitions)
			}
		}
		for (let sAttributeDef of sElement.elements("Attribute")) {
			let name: string = sAttributeDef.requiredAttribute("Name").asString()
			let attributeDef: SsAttributeDef = definitions.attributeDefs.add(name)
			let dataTypeStr: string = sAttributeDef.requiredAttribute("DataType").asString()
			attributeDef.dataType = SmlSchemaLoader.loadDataType(dataTypeStr, definitions)
		}
		for (let sElementDef of sElement.elements("Element")) {
			let name: string = sElementDef.requiredAttribute("Name").asString()
			let elementDef: SsElementDef = definitions.elementDefs.add(name)
			this.loadElementDef(sElementDef, elementDef)
		}
	}

	parse(content: string): SmlSchema {
		try {
			let document: SmlDocument = SmlDocument.parse(content)
			let sRootElement: SmlElement = document.root
			sRootElement.assureName("Schema")
			sRootElement.assureElementNames(["EnumType", "Struct", "Attribute", "Element"])
			sRootElement.assureAttributeNames(["RootElement"])

			this.loadDefinitions(document.root, this.schema.definitions)
			
			let sRootElementAttribute: SmlAttribute | null = document.root.optionalAttribute("RootElement")
			if (sRootElementAttribute !== null) {
				let rootElementName: string = sRootElementAttribute.asString()
				this.schema.setRootElementByName(rootElementName)
			} else {
				this.schema.setRootElementDefault()
			}

			return this.schema
		} catch (e) {
			throw new Error("Could not parse schema because "+e)
		}
	}
}

// ----------------------------------------------------------------------

class SmlSchemaSerializer {
	private static serializeValueTypeDef(valueTypeDef: SsValueTypeDef, sElement: SmlElement) {
		if (valueTypeDef instanceof SsEnumTypeDef) {
			let enumTypeDef: SsEnumTypeDef = valueTypeDef as SsEnumTypeDef
			let sEnumTypeDef: SmlElement = sElement.addElement("EnumTypeDef")
			sEnumTypeDef.addAttribute("Name", [enumTypeDef.name])
			sEnumTypeDef.addAttribute("Values", enumTypeDef.values)
		} else {
			throw new Error("Todo")
		}
	}

	private static serializeStructDef(structDef: SsStructDef, sElement: SmlElement) {
		let sStructDef: SmlElement = sElement.addElement("StructDef")
		sStructDef.addAttribute("Name", [structDef.name])
		for (let value of structDef.values) {
			sStructDef.addAttribute("Value", [value.name, value.optional ? "Optional" : "Required", value.getTypeString()])
		}
	}

	private static serializeOccurrence(occurrence: SsRange): string {
		if (occurrence.isRequired) { return "Required" }
		else if (occurrence.isOptional) { return "Optional" }
		else if (occurrence.isRepeatedPlus) { return "Repeated+" }
		else if (occurrence.isRepeatedStar) { return "Repeated*" }
		throw new Error("Invalid occurrence")
	}

	private static serializeAttributeDef(attributeDef: SsAttributeDef, sElement: SmlElement) {
		let sAttributeDef: SmlElement = sElement.addElement("AttributeDef")
		sAttributeDef.addAttribute("Name", [attributeDef.name])
		sAttributeDef.addAttribute("DataType", [attributeDef.dataType.toString()])
	}

	private static serializeElementDef(elementDef: SsElementDef, sElement: SmlElement) {
		let sElementDef: SmlElement = sElement.addElement("ElementDef")
		sElementDef.addAttribute("Name", [elementDef.name])
		this.serializeDefinitions(elementDef.definitions, sElementDef)
		
		if (elementDef.content !== null) {
			if (elementDef.content instanceof SsUnorderedContent) {
				let unorderedContent: SsUnorderedContent = elementDef.content as SsUnorderedContent
				for (let unorderedAttribute of unorderedContent.unorderedAttributes) {
					let occurrenceStr: string = SmlSchemaSerializer.serializeOccurrence(unorderedAttribute.occurrence)
					let values: string[] = [unorderedAttribute.attributeDef.name, occurrenceStr]
					if (unorderedAttribute.inline) {
						values.push(unorderedAttribute.attributeDef.dataType.toString())
					}
					sElementDef.addAttribute("Attribute", values)
				}
				for (let unorderedElement of unorderedContent.unorderedElements) {
					let occurrenceStr: string = SmlSchemaSerializer.serializeOccurrence(unorderedElement.occurrence)
					sElementDef.addAttribute("Element", [unorderedElement.elementDef.name, occurrenceStr])
				}
			} else {
				throw new Error("Todo")
			}
		}
	}

	private static serializeDefinitions(definitions: SsDefinitions, sElement: SmlElement) {
		for (let valueTypeDef of definitions.valueTypeDefs.values) {
			SmlSchemaSerializer.serializeValueTypeDef(valueTypeDef, sElement)
		}
		for (let structDef of definitions.structDefs.values) {
			SmlSchemaSerializer.serializeStructDef(structDef, sElement)
		}
		for (let attributeDef of definitions.attributeDefs.values) {
			SmlSchemaSerializer.serializeAttributeDef(attributeDef, sElement)
		}
		for (let elementDef of definitions.elementDefs.values) {
			SmlSchemaSerializer.serializeElementDef(elementDef, sElement)
		}
	}

	static serialize(schema: SmlSchema): SmlDocument {
		let sRootElement: SmlElement = new SmlElement("Schema")
		SmlSchemaSerializer.serializeDefinitions(schema.definitions, sRootElement)
		if (schema.definitions.elementDefs.values.length > 1) {
			sRootElement.addAttribute("RootElement", [schema.getRootElement().name])
		}
		let document: SmlDocument = new SmlDocument(sRootElement)
		return document
	}
}

// ----------------------------------------------------------------------

class SmlValidator {

}