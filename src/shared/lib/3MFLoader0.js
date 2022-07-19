/* eslint-disable */
import {
	BufferAttribute,
	BufferGeometry,
	ClampToEdgeWrapping,
	Color,
	FileLoader,
	Float32BufferAttribute,
	Group,
	LinearFilter,
	LinearMipmapLinearFilter,
	Loader,
	LoaderUtils,
	Matrix4,
	Mesh,
	MeshPhongMaterial,
	MeshStandardMaterial,
	MirroredRepeatWrapping,
	NearestFilter,
	RepeatWrapping,
	TextureLoader,
	sRGBEncoding,
	Texture
} from 'three';
// import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import * as fflate from './fflate.module.js';

/**
 *
 * 3D Manufacturing Format (3MF) specification: https://3mf.io/specification/
 *
 * The following features from the core specification are supported:
 *
 * - 3D Models
 * - Object Resources (Meshes and Components)
 * - Material Resources (Base Materials)
 *
 * 3MF Materials and Properties Extension are only partially supported.
 *
 * - Texture 2D
 * - Texture 2D Groups
 * - Color Groups (Vertex Colors)
 * - Metallic Display Properties (PBR)
 */

var ThreeMFLoader = function ( manager ) {

	Loader.call( this, manager );

	this.availableExtensions = [];

};

ThreeMFLoader.prototype = Object.assign( Object.create( Loader.prototype ), {

	constructor: ThreeMFLoader,

	load: function ( url, onLoad, onProgress, onError ) {

		var scope = this;
		var loader = new FileLoader( scope.manager );
		loader.setPath( scope.path );
		loader.setResponseType( 'arraybuffer' );
		loader.setRequestHeader( scope.requestHeader );
		loader.setWithCredentials( scope.withCredentials );
		loader.load( url, async function ( buffer ) {

			try {
				const result = await scope.parse( buffer, onProgress )
				onLoad( result );

			} catch ( e ) {

				if ( onError ) {

					onError( e );

				} else {

					console.error( e );

				}

				scope.manager.itemError( url );

			}

		}, null, onError );

	},

	loadFromBuffer: async function(buffer, onLoad, onError) {
		var scope = this;

		try {

			const result = await scope.parse( buffer, function() {} );
			onLoad( result );

		} catch ( e ) {

			if ( onError ) {

				onError( e );

			} else {

				console.error( e );

			}

			scope.manager.itemError( '3MFLoader.loadFromBuffer' );

		}
	},

	parse: async function ( data, onProgress ) {

		var scope = this;
		var textureLoader = new TextureLoader( this.manager );

		async function loadDocument( data ) {

			var zip = null;
			var file = null;

			var relsName;
			var modelRelsName;
			var modelPartNames = [];
			var printTicketPartNames = [];
			var texturesPartNames = [];
			var otherPartNames = [];

			var rels;
			var modelRels;
			var modelParts = {};
			var printTicketParts = {};
			var texturesParts = {};
			var otherParts = {};

			try {

				// zip = await JSZip.loadAsync( data ); // eslint-disable-line no-undef
				zip = fflate.unzipSync(new Uint8Array(data)); // eslint-disable-line no-undef

			} catch ( e ) {

				if ( e instanceof ReferenceError ) {

					console.error( 'THREE.3MFLoader: jszip missing and file is compressed.' );
					return null;

				}

			}
			onProgress(0.1);
			// for ( file in zip.files ) {
			//
			// 	if ( file.match( /\_rels\/.rels$/ ) ) {
			//
			// 		relsName = file;
			//
			// 	} else if ( file.match( /3D\/_rels\/.*\.model\.rels$/ ) ) {
			//
			// 		modelRelsName = file;
			//
			// 	} else if ( file.match( /^3D\/.*\.model$/ ) ) {
			//
			// 		modelPartNames.push( file );
			//
			// 	} else if ( file.match( /^3D\/Metadata\/.*\.xml$/ ) ) {
			//
			// 		printTicketPartNames.push( file );
			//
			// 	} else if ( file.match( /^3D\/Textures?\/.*/ ) ) {
			//
			// 		texturesPartNames.push( file );
			//
			// 	} else if ( file.match( /^3D\/Other\/.*/ ) ) {
			//
			// 		otherPartNames.push( file );
			//
			// 	}
			//
			// }

			for ( file in zip ) {

				if ( file.match( /\_rels\/.rels$/ ) ) {

					relsName = file;

				} else if ( file.match( /3D\/_rels\/.*\.model\.rels$/ ) ) {

					modelRelsName = file;

				} else if ( file.match( /^3D\/.*\.model$/ ) ) {

					modelPartNames.push( file );

				} else if ( file.match( /^3D\/Textures?\/.*/ ) ) {

					texturesPartNames.push( file );

				}

			}


			//

			var relsView =  zip[ relsName ];
			var relsFileText = LoaderUtils.decodeText( relsView );
			rels = parseRelsXml( relsFileText );

			//

			if ( modelRelsName ) {

				var relsView =  zip[ modelRelsName ];
				var relsFileText = LoaderUtils.decodeText( relsView );
				modelRels = parseRelsXml( relsFileText );

			}

			//

			for ( var i = 0; i < modelPartNames.length; i ++ ) {

				var modelPart = modelPartNames[ i ];
				var view = zip[ modelPart ];

				var fileText = LoaderUtils.decodeText( view );
				// remove namespaced label
				// fileText = fileText.replaceAll(/(<\/)\S+:(\S+>)/ig, '$1$2').replaceAll(/(<)\S+:(\S+)/ig, '$1$2');
				var xmlData = new DOMParser().parseFromString( fileText, 'application/xml' );

				if ( xmlData.documentElement.nodeName.toLowerCase() !== 'model' ) {

					console.error( 'THREE.3MFLoader: Error loading 3MF - no 3MF document found: ', modelPart );

				}

				var modelNode = xmlData.getElementsByTagName( 'model' )[0];
				var extensions = {};

				for ( var i = 0; i < modelNode.attributes.length; i ++ ) {

					var attr = modelNode.attributes[ i ];
					if ( attr.name.match( /^xmlns:(.+)$/ ) ) {

						extensions[ attr.value ] = RegExp.$1;

					}

				}

				var modelData = parseModelNode( modelNode );
				modelData[ 'xml' ] = modelNode;

				if ( 0 < Object.keys( extensions ).length ) {

					modelData[ 'extensions' ] = extensions;

				}

				modelParts[ modelPart ] = modelData;

			}

			//

			for ( var i = 0; i < texturesPartNames.length; i ++ ) {

				var texturesPartName = texturesPartNames[ i ];
				texturesParts[ texturesPartName ] =  zip[ texturesPartName ].buffer;;

			}

			return {
				rels: rels,
				modelRels: modelRels,
				model: modelParts,
				printTicket: printTicketParts,
				texture: texturesParts,
				other: otherParts
			};

		}

		function parseRelsXml( relsFileText ) {

			var relationships = [];

			var relsXmlData = new DOMParser().parseFromString( relsFileText, 'application/xml' );

			var relsNodes = relsXmlData.getElementsByTagName( 'Relationship' );

			for ( var i = 0; i < relsNodes.length; i ++ ) {

				var relsNode = relsNodes[ i ];

				var relationship = {
					target: relsNode.getAttribute( 'Target' ), //required
					id: relsNode.getAttribute( 'Id' ), //required
					type: relsNode.getAttribute( 'Type' ) //required
				};

				relationships.push( relationship );

			}

			return relationships;

		}

		function parseMetadataNodes( metadataNodes ) {

			var metadataData = {};

			for ( var i = 0; i < metadataNodes.length; i ++ ) {

				var metadataNode = metadataNodes[ i ];
				var name = metadataNode.getAttribute( 'name' );
				var validNames = [
					'Title',
					'Designer',
					'Description',
					'Copyright',
					'LicenseTerms',
					'Rating',
					'CreationDate',
					'ModificationDate'
				];

				if ( 0 <= validNames.indexOf( name ) ) {

					metadataData[ name ] = metadataNode.textContent;

				}

			}

			return metadataData;

		}

		function parseBasematerialsNode( basematerialsNode ) {

			var basematerialsData = {
				id: basematerialsNode.getAttribute( 'id' ), // required
				basematerials: []
			};

			var basematerialNodes = basematerialsNode.getElementsByTagName( 'base' );

			for ( var i = 0; i < basematerialNodes.length; i ++ ) {

				var basematerialNode = basematerialNodes[ i ];
				var basematerialData = parseBasematerialNode( basematerialNode );
				basematerialData.index = i; // the order and count of the material nodes form an implicit 0-based index
				basematerialsData.basematerials.push( basematerialData );

			}

			return basematerialsData;

		}

		function parseTexture2DNode( texture2DNode ) {

			var texture2dData = {
				id: texture2DNode.getAttribute( 'id' ), // required
				path: texture2DNode.getAttribute( 'path' ), // required
				contenttype: texture2DNode.getAttribute( 'contenttype' ), // required
				tilestyleu: texture2DNode.getAttribute( 'tilestyleu' ),
				tilestylev: texture2DNode.getAttribute( 'tilestylev' ),
				filter: texture2DNode.getAttribute( 'filter' ),
			};

			return texture2dData;

		}

		function parseTextures2DGroupNode( texture2DGroupNode ) {

			var texture2DGroupData = {
				id: texture2DGroupNode.getAttribute( 'id' ), // required
				texid: texture2DGroupNode.getAttribute( 'texid' ), // required
				displaypropertiesid: texture2DGroupNode.getAttribute( 'displaypropertiesid' )
			};

			var tex2coordNodes = texture2DGroupNode.getElementsByTagName( 'tex2coord' );

			var uvs = [];

			for ( var i = 0; i < tex2coordNodes.length; i ++ ) {

				var tex2coordNode = tex2coordNodes[ i ];
				var u = tex2coordNode.getAttribute( 'u' );
				var v = tex2coordNode.getAttribute( 'v' );

				uvs.push( parseFloat( u ), parseFloat( v ) );

			}

			texture2DGroupData[ 'uvs' ] = new Float32Array( uvs );

			return texture2DGroupData;

		}

		function parseColorGroupNode( colorGroupNode ) {

			var colorGroupData = {
				id: colorGroupNode.getAttribute( 'id' ), // required
				displaypropertiesid: colorGroupNode.getAttribute( 'displaypropertiesid' )
			};

			var colorNodes = colorGroupNode.getElementsByTagName( 'color' );

			var colors = [];
			var colorObject = new Color();

			for ( var i = 0; i < colorNodes.length; i ++ ) {

				var colorNode = colorNodes[ i ];
				var color = colorNode.getAttribute( 'color' );

				colorObject.setStyle( color.substring( 0, 7 ) );
				colorObject.convertSRGBToLinear(); // color is in sRGB

				colors.push( colorObject.r, colorObject.g, colorObject.b );

			}

			colorGroupData[ 'colors' ] = new Float32Array( colors );

			return colorGroupData;

		}

		function parseMetallicDisplaypropertiesNode( metallicDisplaypropetiesNode ) {

			var metallicDisplaypropertiesData = {
				id: metallicDisplaypropetiesNode.getAttribute( 'id' ) // required
			};

			var metallicNodes = metallicDisplaypropetiesNode.getElementsByTagName( 'pbmetallic' );

			var metallicData = [];

			for ( var i = 0; i < metallicNodes.length; i ++ ) {

				var metallicNode = metallicNodes[ i ];

				metallicData.push( {
					name: metallicNode.getAttribute( 'name' ), // required
					metallicness: parseFloat( metallicNode.getAttribute( 'metallicness' ) ), // required
					roughness: parseFloat( metallicNode.getAttribute( 'roughness' ) ) // required
				} );

			}

			metallicDisplaypropertiesData.data = metallicData;

			return metallicDisplaypropertiesData;

		}

		function parseBasematerialNode( basematerialNode ) {

			var basematerialData = {};

			basematerialData[ 'name' ] = basematerialNode.getAttribute( 'name' ); // required
			basematerialData[ 'displaycolor' ] = basematerialNode.getAttribute( 'displaycolor' ); // required
			basematerialData[ 'displaypropertiesid' ] = basematerialNode.getAttribute( 'displaypropertiesid' );

			return basematerialData;

		}

		function parseMeshNode( meshNode ) {

			var meshData = {};

			var vertices = [];
			var verticesNode = meshNode.getElementsByTagName( 'vertices' )[0];
			var vertexNodes = verticesNode.getElementsByTagName( 'vertex' );

			for ( var i = 0; i < vertexNodes.length; i ++ ) {

				var vertexNode = vertexNodes[ i ];
				var x = vertexNode.getAttribute( 'x' );
				var y = vertexNode.getAttribute( 'y' );
				var z = vertexNode.getAttribute( 'z' );

				vertices.push( parseFloat( x ), parseFloat( y ), parseFloat( z ) );

			}

			meshData[ 'vertices' ] = new Float32Array( vertices );

			var triangleProperties = [];
			var triangles = [];
			var trianglesNode = meshNode.getElementsByTagName( 'triangles' )[0];
			var triangleNodes = trianglesNode.getElementsByTagName( 'triangle' );

			for ( var i = 0; i < triangleNodes.length; i ++ ) {

				var triangleNode = triangleNodes[ i ];
				var v1 = triangleNode.getAttribute( 'v1' );
				var v2 = triangleNode.getAttribute( 'v2' );
				var v3 = triangleNode.getAttribute( 'v3' );
				var p1 = triangleNode.getAttribute( 'p1' );
				var p2 = triangleNode.getAttribute( 'p2' );
				var p3 = triangleNode.getAttribute( 'p3' );
				var pid = triangleNode.getAttribute( 'pid' );

				var triangleProperty = {};

				triangleProperty[ 'v1' ] = parseInt( v1, 10 );
				triangleProperty[ 'v2' ] = parseInt( v2, 10 );
				triangleProperty[ 'v3' ] = parseInt( v3, 10 );

				triangles.push( triangleProperty[ 'v1' ], triangleProperty[ 'v2' ], triangleProperty[ 'v3' ] );

				// optional

				if ( p1 ) {

					triangleProperty[ 'p1' ] = parseInt( p1, 10 );

				}

				if ( p2 ) {

					triangleProperty[ 'p2' ] = parseInt( p2, 10 );

				}

				if ( p3 ) {

					triangleProperty[ 'p3' ] = parseInt( p3, 10 );

				}

				if ( pid ) {

					triangleProperty[ 'pid' ] = pid;

				}

				if ( 0 < Object.keys( triangleProperty ).length ) {

					triangleProperties.push( triangleProperty );

				}

			}

			meshData[ 'triangleProperties' ] = triangleProperties;
			meshData[ 'triangles' ] = new Uint32Array( triangles );

			// console.log('parseMeshNode', meshData[ 'triangleProperties' ], meshData[ 'triangles' ])
			return meshData;

		}

		function parseComponentsNode( componentsNode ) {

			var components = [];

			var componentNodes = componentsNode.getElementsByTagName( 'component' );

			for ( var i = 0; i < componentNodes.length; i ++ ) {

				var componentNode = componentNodes[ i ];
				var componentData = parseComponentNode( componentNode );
				components.push( componentData );

			}

			return components;

		}

		function parseComponentNode( componentNode ) {

			var componentData = {};

			componentData[ 'objectId' ] = componentNode.getAttribute( 'objectid' ); // required

			var transform = componentNode.getAttribute( 'transform' );

			if ( transform ) {

				componentData[ 'transform' ] = parseTransform( transform );

			}

			return componentData;

		}

		function parseTransform( transform ) {

			var t = [];
			transform.split( ' ' ).forEach( function ( s ) {

				t.push( parseFloat( s ) );

			} );

			var matrix = new Matrix4();
			matrix.set(
				t[ 0 ], t[ 3 ], t[ 6 ], t[ 9 ],
				t[ 1 ], t[ 4 ], t[ 7 ], t[ 10 ],
				t[ 2 ], t[ 5 ], t[ 8 ], t[ 11 ],
				 0.0, 0.0, 0.0, 1.0
			);

			return matrix;

		}

		function parseObjectNode( objectNode ) {

			var objectData = {
				type: objectNode.getAttribute( 'type' )
			};

			var id = objectNode.getAttribute( 'id' );

			if ( id ) {

				objectData[ 'id' ] = id;

			}

			var pid = objectNode.getAttribute( 'pid' );

			if ( pid ) {

				objectData[ 'pid' ] = pid;

			}

			var pindex = objectNode.getAttribute( 'pindex' );

			if ( pindex ) {

				objectData[ 'pindex' ] = pindex;

			}

			var thumbnail = objectNode.getAttribute( 'thumbnail' );

			if ( thumbnail ) {

				objectData[ 'thumbnail' ] = thumbnail;

			}

			var partnumber = objectNode.getAttribute( 'partnumber' );

			if ( partnumber ) {

				objectData[ 'partnumber' ] = partnumber;

			}

			var name = objectNode.getAttribute( 'name' );

			if ( name ) {

				objectData[ 'name' ] = name;

			}

			var meshNode = objectNode.getElementsByTagName( 'mesh' )[0];

			if ( meshNode ) {

				objectData[ 'mesh' ] = parseMeshNode( meshNode );

			}

			var componentsNode = objectNode.getElementsByTagName( 'components' )[0];

			if ( componentsNode ) {

				objectData[ 'components' ] = parseComponentsNode( componentsNode );

			}

			return objectData;

		}

		function parseResourcesNode( resourcesNode ) {

			var resourcesData = {};

			resourcesData[ 'basematerials' ] = {};
			var basematerialsNodes = resourcesNode.getElementsByTagName( 'basematerials' );

			for ( var i = 0; i < basematerialsNodes.length; i ++ ) {

				var basematerialsNode = basematerialsNodes[ i ];
				var basematerialsData = parseBasematerialsNode( basematerialsNode );
				resourcesData[ 'basematerials' ][ basematerialsData[ 'id' ] ] = basematerialsData;

			}

			//

			resourcesData[ 'texture2d' ] = {};
			var textures2DNodes = resourcesNode.getElementsByTagName( 'texture2d' );

			for ( var i = 0; i < textures2DNodes.length; i ++ ) {

				var textures2DNode = textures2DNodes[ i ];
				var texture2DData = parseTexture2DNode( textures2DNode );
				resourcesData[ 'texture2d' ][ texture2DData[ 'id' ] ] = texture2DData;

			}

			//

			resourcesData[ 'colorgroup' ] = {};
			var colorGroupNodes = resourcesNode.getElementsByTagName( 'colorgroup' );

			for ( var i = 0; i < colorGroupNodes.length; i ++ ) {

				var colorGroupNode = colorGroupNodes[ i ];
				var colorGroupData = parseColorGroupNode( colorGroupNode );
				resourcesData[ 'colorgroup' ][ colorGroupData[ 'id' ] ] = colorGroupData;

			}

			//

			resourcesData[ 'pbmetallicdisplayproperties' ] = {};
			var pbmetallicdisplaypropertiesNodes = resourcesNode.getElementsByTagName( 'pbmetallicdisplayproperties' );

			for ( var i = 0; i < pbmetallicdisplaypropertiesNodes.length; i ++ ) {

				var pbmetallicdisplaypropertiesNode = pbmetallicdisplaypropertiesNodes[ i ];
				var pbmetallicdisplaypropertiesData = parseMetallicDisplaypropertiesNode( pbmetallicdisplaypropertiesNode );
				resourcesData[ 'pbmetallicdisplayproperties' ][ pbmetallicdisplaypropertiesData[ 'id' ] ] = pbmetallicdisplaypropertiesData;

			}

			//

			resourcesData[ 'texture2dgroup' ] = {};
			var textures2DGroupNodes = resourcesNode.getElementsByTagName( 'texture2dgroup' );

			for ( var i = 0; i < textures2DGroupNodes.length; i ++ ) {

				var textures2DGroupNode = textures2DGroupNodes[ i ];
				var textures2DGroupData = parseTextures2DGroupNode( textures2DGroupNode );
				resourcesData[ 'texture2dgroup' ][ textures2DGroupData[ 'id' ] ] = textures2DGroupData;

			}

			//

			resourcesData[ 'object' ] = {};
			var objectNodes = resourcesNode.getElementsByTagName( 'object' );

			for ( var i = 0; i < objectNodes.length; i ++ ) {

				var objectNode = objectNodes[ i ];
				var objectData = parseObjectNode( objectNode );
				resourcesData[ 'object' ][ objectData[ 'id' ] ] = objectData;
				onProgress(i / objectNodes.length * 0.4 + 0.1);
			}

			return resourcesData;

		}

		function parseBuildNode( buildNode ) {

			var buildData = [];
			var itemNodes = buildNode.getElementsByTagName( 'item' );

			for ( var i = 0; i < itemNodes.length; i ++ ) {

				var itemNode = itemNodes[ i ];
				var buildItem = {
					objectId: itemNode.getAttribute( 'objectid' )
				};
				var transform = itemNode.getAttribute( 'transform' );

				if ( transform ) {

					buildItem[ 'transform' ] = parseTransform( transform );

				}

				buildData.push( buildItem );

			}

			return buildData;

		}

		function parseModelNode( modelNode ) {

			var modelData = { unit: modelNode.getAttribute( 'unit' ) || 'millimeter' };
			var metadataNodes = modelNode.getElementsByTagName( 'metadata' );

			if ( metadataNodes ) {

				modelData[ 'metadata' ] = parseMetadataNodes( metadataNodes );

			}

			var resourcesNode = modelNode.getElementsByTagName( 'resources' )[0];

			if ( resourcesNode ) {

				modelData[ 'resources' ] = parseResourcesNode( resourcesNode );

			}

			var buildNode = modelNode.getElementsByTagName( 'build' )[0];

			if ( buildNode ) {

				modelData[ 'build' ] = parseBuildNode( buildNode );

			}

			return modelData;

		}

		function buildTexture( texture2dgroup, objects, modelData, textureData ) {

			var texid = texture2dgroup.texid;
			var texture2ds = modelData.resources.texture2d;
			var texture2d = texture2ds[ texid ];

			if ( texture2d ) {

				// var data = textureData[ texture2d.path ];
				// var type = texture2d.contenttype;

				// var blob = new Blob( [ data ], { type: type } );
				// var sourceURI = URL.createObjectURL( blob );
				var texture = new Texture();

				// textureloader not support non-browser environment
				// var texture = textureLoader.load( sourceURI, function () {

				// 	URL.revokeObjectURL( sourceURI );

				// } );

				// texture.encoding = sRGBEncoding;

				// // texture parameters

				// switch ( texture2d.tilestyleu ) {

				// 	case 'wrap':
				// 		texture.wrapS = RepeatWrapping;
				// 		break;

				// 	case 'mirror':
				// 		texture.wrapS = MirroredRepeatWrapping;
				// 		break;

				// 	case 'none':
				// 	case 'clamp':
				// 		texture.wrapS = ClampToEdgeWrapping;
				// 		break;

				// 	default:
				// 		texture.wrapS = RepeatWrapping;

				// }

				// switch ( texture2d.tilestylev ) {

				// 	case 'wrap':
				// 		texture.wrapT = RepeatWrapping;
				// 		break;

				// 	case 'mirror':
				// 		texture.wrapT = MirroredRepeatWrapping;
				// 		break;

				// 	case 'none':
				// 	case 'clamp':
				// 		texture.wrapT = ClampToEdgeWrapping;
				// 		break;

				// 	default:
				// 		texture.wrapT = RepeatWrapping;

				// }

				// switch ( texture2d.filter ) {

				// 	case 'auto':
				// 		texture.magFilter = LinearFilter;
				// 		texture.minFilter = LinearMipmapLinearFilter;
				// 		break;

				// 	case 'linear':
				// 		texture.magFilter = LinearFilter;
				// 		texture.minFilter = LinearFilter;
				// 		break;

				// 	case 'nearest':
				// 		texture.magFilter = NearestFilter;
				// 		texture.minFilter = NearestFilter;
				// 		break;

				// 	default:
				// 		texture.magFilter = LinearFilter;
				// 		texture.minFilter = LinearMipmapLinearFilter;

				// }

				return texture;

			} else {

				return null;

			}

		}

		function buildBasematerialsMeshes( basematerials, triangleProperties, modelData, meshData, textureData, objectData ) {

			var objectPindex = objectData.pindex;

			var materialMap = {};

			for ( var i = 0, l = triangleProperties.length; i < l; i ++ ) {

				var triangleProperty = triangleProperties[ i ];
				var pindex = ( triangleProperty.p1 !== undefined ) ? triangleProperty.p1 : objectPindex;

				if ( materialMap[ pindex ] === undefined ) materialMap[ pindex ] = [];

				materialMap[ pindex ].push( triangleProperty );

			}

			//

			var keys = Object.keys( materialMap );
			var meshes = [];

			for ( var i = 0, l = keys.length; i < l; i ++ ) {

				var materialIndex = keys[ i ];
				var trianglePropertiesProps = materialMap[ materialIndex ];
				var basematerialData = basematerials.basematerials[ materialIndex ];
				var material = getBuild( basematerialData, objects, modelData, textureData, objectData, buildBasematerial );

				//

				var geometry = new BufferGeometry();

				var positionData = [];

				var vertices = meshData.vertices;

				for ( var j = 0, jl = trianglePropertiesProps.length; j < jl; j ++ ) {

					var triangleProperty = trianglePropertiesProps[ j ];

					positionData.push( vertices[ ( triangleProperty.v1 * 3 ) + 0 ] );
					positionData.push( vertices[ ( triangleProperty.v1 * 3 ) + 1 ] );
					positionData.push( vertices[ ( triangleProperty.v1 * 3 ) + 2 ] );

					positionData.push( vertices[ ( triangleProperty.v2 * 3 ) + 0 ] );
					positionData.push( vertices[ ( triangleProperty.v2 * 3 ) + 1 ] );
					positionData.push( vertices[ ( triangleProperty.v2 * 3 ) + 2 ] );

					positionData.push( vertices[ ( triangleProperty.v3 * 3 ) + 0 ] );
					positionData.push( vertices[ ( triangleProperty.v3 * 3 ) + 1 ] );
					positionData.push( vertices[ ( triangleProperty.v3 * 3 ) + 2 ] );


				}

				geometry.setAttribute( 'position', new Float32BufferAttribute( positionData, 3 ) );

				//

				var mesh = new Mesh( geometry, material );
				meshes.push( mesh );

			}

			return meshes;

		}

		function buildTexturedMesh( texture2dgroup, triangleProperties, modelData, meshData, textureData, objectData ) {

			// geometry

			var geometry = new BufferGeometry();

			var positionData = [];
			var uvData = [];

			var vertices = meshData.vertices;
			var uvs = texture2dgroup.uvs;

			for ( var i = 0, l = triangleProperties.length; i < l; i ++ ) {

				var triangleProperty = triangleProperties[ i ];

				positionData.push( vertices[ ( triangleProperty.v1 * 3 ) + 0 ] );
				positionData.push( vertices[ ( triangleProperty.v1 * 3 ) + 1 ] );
				positionData.push( vertices[ ( triangleProperty.v1 * 3 ) + 2 ] );

				positionData.push( vertices[ ( triangleProperty.v2 * 3 ) + 0 ] );
				positionData.push( vertices[ ( triangleProperty.v2 * 3 ) + 1 ] );
				positionData.push( vertices[ ( triangleProperty.v2 * 3 ) + 2 ] );

				positionData.push( vertices[ ( triangleProperty.v3 * 3 ) + 0 ] );
				positionData.push( vertices[ ( triangleProperty.v3 * 3 ) + 1 ] );
				positionData.push( vertices[ ( triangleProperty.v3 * 3 ) + 2 ] );

				//

				uvData.push( uvs[ ( triangleProperty.p1 * 2 ) + 0 ] );
				uvData.push( uvs[ ( triangleProperty.p1 * 2 ) + 1 ] );

				uvData.push( uvs[ ( triangleProperty.p2 * 2 ) + 0 ] );
				uvData.push( uvs[ ( triangleProperty.p2 * 2 ) + 1 ] );

				uvData.push( uvs[ ( triangleProperty.p3 * 2 ) + 0 ] );
				uvData.push( uvs[ ( triangleProperty.p3 * 2 ) + 1 ] );

			}

			geometry.setAttribute( 'position', new Float32BufferAttribute( positionData, 3 ) );
			geometry.setAttribute( 'uv', new Float32BufferAttribute( uvData, 2 ) );

			// material

			var texture = getBuild( texture2dgroup, objects, modelData, textureData, objectData, buildTexture );

			var material = new MeshPhongMaterial( { map: texture, flatShading: true } );

			// mesh

			var mesh = new Mesh( geometry, material );

			return mesh;

		}

		function buildVertexColorMesh( colorgroup, triangleProperties, modelData, meshData, objectData ) {

			// geometry

			var geometry = new BufferGeometry();

			var positionData = [];
			var colorData = [];

			var vertices = meshData.vertices;
			var colors = colorgroup.colors;

			for ( var i = 0, l = triangleProperties.length; i < l; i ++ ) {

				var triangleProperty = triangleProperties[ i ];

				var v1 = triangleProperty.v1;
				var v2 = triangleProperty.v2;
				var v3 = triangleProperty.v3;

				positionData.push( vertices[ ( v1 * 3 ) + 0 ] );
				positionData.push( vertices[ ( v1 * 3 ) + 1 ] );
				positionData.push( vertices[ ( v1 * 3 ) + 2 ] );

				positionData.push( vertices[ ( v2 * 3 ) + 0 ] );
				positionData.push( vertices[ ( v2 * 3 ) + 1 ] );
				positionData.push( vertices[ ( v2 * 3 ) + 2 ] );

				positionData.push( vertices[ ( v3 * 3 ) + 0 ] );
				positionData.push( vertices[ ( v3 * 3 ) + 1 ] );
				positionData.push( vertices[ ( v3 * 3 ) + 2 ] );

				//

				var p1 = ( triangleProperty.p1 !== undefined ) ? triangleProperty.p1 : objectData.pindex;
				var p2 = ( triangleProperty.p2 !== undefined ) ? triangleProperty.p2 : p1;
				var p3 = ( triangleProperty.p3 !== undefined ) ? triangleProperty.p3 : p1;

				colorData.push( colors[ ( p1 * 3 ) + 0 ] );
				colorData.push( colors[ ( p1 * 3 ) + 1 ] );
				colorData.push( colors[ ( p1 * 3 ) + 2 ] );

				colorData.push( colors[ ( p2 * 3 ) + 0 ] );
				colorData.push( colors[ ( p2 * 3 ) + 1 ] );
				colorData.push( colors[ ( p2 * 3 ) + 2 ] );

				colorData.push( colors[ ( p3 * 3 ) + 0 ] );
				colorData.push( colors[ ( p3 * 3 ) + 1 ] );
				colorData.push( colors[ ( p3 * 3 ) + 2 ] );

			}

			geometry.setAttribute( 'position', new Float32BufferAttribute( positionData, 3 ) );
			geometry.setAttribute( 'color', new Float32BufferAttribute( colorData, 3 ) );

			// material

			var material = new MeshPhongMaterial( { vertexColors: true, flatShading: true } );

			// mesh

			var mesh = new Mesh( geometry, material );

			return mesh;

		}

		function buildDefaultMesh( meshData ) {

			var geometry = new BufferGeometry();
			geometry.setIndex( new BufferAttribute( meshData[ 'triangles' ], 1 ) );
			geometry.setAttribute( 'position', new BufferAttribute( meshData[ 'vertices' ], 3 ) );

			var material = new MeshPhongMaterial( { color: 0xaaaaff, flatShading: true } );

			var mesh = new Mesh( geometry, material );

			return mesh;

		}

		function buildMeshes( resourceMap, modelData, meshData, textureData, objectData ) {

			var keys = Object.keys( resourceMap );
			var meshes = [];

			for ( var i = 0, il = keys.length; i < il; i ++ ) {

				var resourceId = keys[ i ];
				var triangleProperties = resourceMap[ resourceId ];
				var resourceType = getResourceType( resourceId, modelData );

				switch ( resourceType ) {

					case 'material':
						var basematerials = modelData.resources.basematerials[ resourceId ];
						var newMeshes = buildBasematerialsMeshes( basematerials, triangleProperties, modelData, meshData, textureData, objectData );

						for ( var j = 0, jl = newMeshes.length; j < jl; j ++ ) {

							meshes.push( newMeshes[ j ] );

						}

						break;

					case 'texture':
						var texture2dgroup = modelData.resources.texture2dgroup[ resourceId ];
						meshes.push( buildTexturedMesh( texture2dgroup, triangleProperties, modelData, meshData, textureData, objectData ) );
						break;

					case 'vertexColors':
						var colorgroup = modelData.resources.colorgroup[ resourceId ];
						meshes.push( buildVertexColorMesh( colorgroup, triangleProperties, modelData, meshData, objectData ) );
						break;

					case 'default':
						meshes.push( buildDefaultMesh( meshData ) );
						break;

					default:
						console.error( 'THREE.3MFLoader: Unsupported resource type.' );

				}

			}

			return meshes;

		}

		function getResourceType( pid, modelData ) {

			if ( modelData.resources.texture2dgroup[ pid ] !== undefined ) {

				return 'texture';

			} else if ( modelData.resources.basematerials[ pid ] !== undefined ) {

				return 'material';

			} else if ( modelData.resources.colorgroup[ pid ] !== undefined ) {

				return 'vertexColors';

			} else if ( pid === 'default' ) {

				return 'default';

			} else {

				return undefined;

			}

		}

		function analyzeObject( modelData, meshData, objectData ) {

			var resourceMap = {};

			var triangleProperties = meshData[ 'triangleProperties' ];

			var objectPid = objectData.pid;

			for ( var i = 0, l = triangleProperties.length; i < l; i ++ ) {

				var triangleProperty = triangleProperties[ i ];
				var pid = ( triangleProperty.pid !== undefined ) ? triangleProperty.pid : objectPid;

				if ( pid === undefined ) pid = 'default';

				if ( resourceMap[ pid ] === undefined ) resourceMap[ pid ] = [];

				resourceMap[ pid ].push( triangleProperty );

			}

			return resourceMap;

		}

		function buildGroup( meshData, objects, modelData, textureData, objectData ) {

			var group = new Group();

			var resourceMap = analyzeObject( modelData, meshData, objectData );
			var meshes = buildMeshes( resourceMap, modelData, meshData, textureData, objectData );

			for ( var i = 0, l = meshes.length; i < l; i ++ ) {

				group.add( meshes[ i ] );

			}

			return group;

		}

		function applyExtensions( extensions, meshData, modelXml ) {

			if ( ! extensions ) {

				return;

			}

			var availableExtensions = [];
			var keys = Object.keys( extensions );

			for ( var i = 0; i < keys.length; i ++ ) {

				var ns = keys[ i ];

				for ( var j = 0; j < scope.availableExtensions.length; j ++ ) {

					var extension = scope.availableExtensions[ j ];

					if ( extension.ns === ns ) {

						availableExtensions.push( extension );

					}

				}

			}

			for ( var i = 0; i < availableExtensions.length; i ++ ) {

				var extension = availableExtensions[ i ];
				extension.apply( modelXml, extensions[ extension[ 'ns' ] ], meshData );

			}

		}

		function getBuild( data, objects, modelData, textureData, objectData, builder ) {

			if ( data.build !== undefined ) return data.build;

			data.build = builder( data, objects, modelData, textureData, objectData );

			return data.build;

		}

		function buildBasematerial( materialData, objects, modelData ) {

			var material;

			var displaypropertiesid = materialData.displaypropertiesid;
			var pbmetallicdisplayproperties = modelData.resources.pbmetallicdisplayproperties;

			if ( displaypropertiesid !== null && pbmetallicdisplayproperties[ displaypropertiesid ] !== undefined ) {

				// metallic display property, use StandardMaterial

				var pbmetallicdisplayproperty = pbmetallicdisplayproperties[ displaypropertiesid ];
				var metallicData = pbmetallicdisplayproperty.data[ materialData.index ];

				material = new MeshStandardMaterial( { flatShading: true, roughness: metallicData.roughness, metalness: metallicData.metallicness } );

			} else {

				// otherwise use PhongMaterial

				material = new MeshPhongMaterial( { flatShading: true } );

			}

			material.name = materialData.name;

			// displaycolor MUST be specified with a value of a 6 or 8 digit hexadecimal number, e.g. "#RRGGBB" or "#RRGGBBAA"

			var displaycolor = materialData.displaycolor;

			var color = displaycolor.substring( 0, 7 );
			material.color.setStyle( color );
			material.color.convertSRGBToLinear(); // displaycolor is in sRGB

			// process alpha if set

			if ( displaycolor.length === 9 ) {

				material.opacity = parseInt( displaycolor.charAt( 7 ) + displaycolor.charAt( 8 ), 16 ) / 255;

			}

			return material;

		}

		function buildComposite( compositeData, objects, modelData, textureData ) {

			var composite = new Group();

			for ( var j = 0; j < compositeData.length; j ++ ) {

				var component = compositeData[ j ];
				var build = objects[ component.objectId ];

				if ( build === undefined ) {

					buildObject( component.objectId, objects, modelData, textureData );
					build = objects[ component.objectId ];

				}

				var object3D = build.clone();

				// apply component transform

				var transform = component.transform;

				if ( transform ) {

					object3D.applyMatrix4( transform );

				}

				composite.add( object3D );

			}

			return composite;

		}

		function buildObject( objectId, objects, modelData, textureData ) {

			var objectData = modelData[ 'resources' ][ 'object' ][ objectId ];

			if ( objectData[ 'mesh' ] ) {

				var meshData = objectData[ 'mesh' ];

				var extensions = modelData[ 'extensions' ];
				var modelXml = modelData[ 'xml' ];

				applyExtensions( extensions, meshData, modelXml );

				objects[ objectData.id ] = getBuild( meshData, objects, modelData, textureData, objectData, buildGroup );

			} else {

				var compositeData = objectData[ 'components' ];

				objects[ objectData.id ] = getBuild( compositeData, objects, modelData, textureData, objectData, buildComposite );

			}

		}

		function buildObjects( data3mf ) {

			var modelsData = data3mf.model;
			var modelRels = data3mf.modelRels;
			var objects = {};
			var modelsKeys = Object.keys( modelsData );
			var textureData = {};

			// evaluate model relationships to textures

			if ( modelRels ) {

				for ( var i = 0, l = modelRels.length; i < l; i ++ ) {

					var modelRel = modelRels[ i ];
					var textureKey = modelRel.target.substring( 1 );

					if ( data3mf.texture[ textureKey ] ) {

						textureData[ modelRel.target ] = data3mf.texture[ textureKey ];

					}

				}

			}

			// start build

			for ( var i = 0; i < modelsKeys.length; i ++ ) {

				var modelsKey = modelsKeys[ i ];
				var modelData = modelsData[ modelsKey ];

				var objectIds = Object.keys( modelData[ 'resources' ][ 'object' ] );

				for ( var j = 0; j < objectIds.length; j ++ ) {

					var objectId = objectIds[ j ];

					buildObject( objectId, objects, modelData, textureData );

				}
				onProgress(i / modelsKeys.length * 0.3 + 0.5);

			}

			return objects;

		}

		function fetch3DModelPart( rels ) {

			for ( var i = 0; i < rels.length; i ++ ) {

				var rel = rels[ i ];
				var extension = rel.target.split( '.' ).pop();

				if ( extension.toLowerCase() === 'model' ) return rel;

			}

		}

		function build( objects, data3mf ) {

			var group = new Group();

			var relationship = fetch3DModelPart( data3mf[ 'rels' ] );
			var buildData = data3mf.model[ relationship[ 'target' ].substring( 1 ) ][ 'build' ];

			for ( var i = 0; i < buildData.length; i ++ ) {

				var buildItem = buildData[ i ];
				var object3D = objects[ buildItem[ 'objectId' ] ];

				// apply transform

				var transform = buildItem[ 'transform' ];

				if ( transform ) {

					object3D.applyMatrix4( transform );

				}

				group.add( object3D );
				onProgress(i / buildData.length * 0.2 + 0.8);

			}
			onProgress(1);

			return group;

		}

		var data3mf = await loadDocument( data );
		onProgress(0.5);
		var objects = buildObjects( data3mf );
		onProgress(0.8);
		return build( objects, data3mf );

	},

	addExtension: function ( extension ) {

		this.availableExtensions.push( extension );

	}

} );

export default ThreeMFLoader;