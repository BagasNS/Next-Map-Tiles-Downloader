"use client"
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  HStack,
  Input,
  NumberDecrementStepper,
  NumberIncrementStepper,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  Select,
  Spinner,
  Text,
  useToast,
  VStack
} from "@chakra-ui/react";
import { useDropzone } from 'react-dropzone'
import { useCallback, useEffect, useState } from "react";
import Swal from 'sweetalert2'
import withReactContent from 'sweetalert2-react-content'
import dynamic from "next/dynamic";
// @ts-ignore
import { featureCollection, FeatureCollection } from "@turf/helpers";
import { Layer, Map } from "leaflet";

import MapSource from './maps-source.json';


const Mapview = dynamic(() => import('@/app/mapview'), {
  ssr: false, loading: () => <SSRLoading loadingText={'Map Loading'}/>
});

const SSRLoading = ({ loadingText }: { loadingText: string }) => {
  return (
    <Flex w={'100%'} h={'100%'} flex={1} justifyContent={'center'} alignItems={'center'}>
      <Flex direction={'row'}>
        <Spinner
          mr={2}
          thickness={'4px'}
          speed={'0.65s'}
          emptyColor={'gray.200'}
          color={'blue.500'}
        />
        <Text>{loadingText}</Text>
      </Flex>
    </Flex>
  )
}

const requestPreview = async (region: FeatureCollection, zoom: number, type: 'rect' | 'count' = 'rect') => {
  const response = await fetch(type === 'rect' ? '/api/grid/preview' : '/api/grid/count', {
    method: 'POST',
    body: JSON.stringify({
      region,
      zoom
    })
  })

  if (response.ok) {
    return response.json()
  } else {
    let res = null
    try {
      res = await response.json();
    } catch (e) {
      throw Error('Failed to get preview grid, please check log for detail error')
    }

    throw Error(res.message)
  }
}


export default function Page() {
  const toast = useToast();

  const [Map, setMap] = useState<Map | undefined>();
  const [previewLayer, setPreviewLayer] = useState<Layer | undefined>();

  // Form Handlers Start
  // @ts-ignore
  const onDrop = useCallback(acceptedFiles => {
    // Do something with the files
  }, [])
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop })
  const [fromZoom, setFromZoom] = useState(10)
  const [toZoom, setToZoom] = useState(10)
  const [mapSource, setMapSource] = useState('http://ecn.t0.tiles.virtualearth.net/tiles/r{quad}.jpeg?g=129&mkt=en&stl=H')
  const [outputScale, setOutputScale] = useState(1);
  const [outputDirectory, setOutputDirectory] = useState('{timestamp}');
  const [outputType, setOutputType] = useState('Directory')
  const [paralellDownload, setParalellDownload] = useState(4);
  const [totalTileLength, setTotalTileLength] = useState<number>(0);

  const maxZoom = MapSource.find(source => Object.values(source.options).some(option => mapSource.includes(option)))?.limits.max || 20;
  // Form Handlers End

  // Map Handlers Start
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  const previewHandler = async () => {
    const { geoJSON } = require('leaflet')
    if (previewLayer) {
      previewLayer.remove();
    }

    const features = Map?.pm.getGeomanLayers(false) || [];
    if (features.length <= 0) {
      return toast({
        title: 'Please select region first',
        position: 'top',
        status: 'error',
        isClosable: true
      })
    }

    setTotalTileLength(0);
    setIsPreviewLoading(true);

    // get tile count
    let resultCount;
    try {
      resultCount = await requestPreview(Map?.pm.getGeomanLayers(true).toGeoJSON() || featureCollection(), Math.max(fromZoom, toZoom), 'count')
    } catch (e: any) {
      setIsPreviewLoading(false)
      return toast({
        title: e.message,
        status: 'error',
        position: 'top',
        isClosable: true
      })
    }

    setTotalTileLength(resultCount.data);

    if (resultCount.data > 10000) {
      const modalConfirm = withReactContent(Swal)
      const { isConfirmed } = await modalConfirm.fire({
        title: 'Large Data Detected',
        text: 'Load data possibly crashing tab browser, do you want to continue?',
        showCancelButton: true,
        showConfirmButton: true,
        confirmButtonText: 'Continue',
        confirmButtonColor: '#DD6B20'
      })

      if (!isConfirmed) {
        setIsPreviewLoading(false)
        return false;
      }
    }

    // get tile preview
    let previewRect;
    try {
      previewRect = await requestPreview(Map?.pm.getGeomanLayers(true).toGeoJSON() || featureCollection(), Math.max(fromZoom, toZoom))
    } catch (e: any) {
      setIsPreviewLoading(false)
      return toast({
        title: e.message,
        status: 'error',
        position: 'top',
        isClosable: true
      })
    }

    setIsPreviewLoading(false)

    const _previewLayer = geoJSON(previewRect.data);
    _previewLayer.setStyle({
      color: 'orange',
      weight: 2,
      opacity: 0.5
    });

    setPreviewLayer(_previewLayer);

    // @ts-ignore
    Map?.addLayer(_previewLayer, { pmIgnore: true });
    _previewLayer.bringToBack();
    _previewLayer.pm.setOptions({
      allowEditing: false,
      allowRemoval: false,
      allowCutting: false
    })
  }

  const removePreviewLayer = () => {
    if (previewLayer) {
      previewLayer.remove();
    }
  }

  useEffect(() => {
    if (Map) {
      Map.on('pm:globaleditmodetoggled', removePreviewLayer);
      Map.on('pm:drawstart', removePreviewLayer);
      Map.on('pm:remove', removePreviewLayer);

      return () => {
        Map.removeEventListener('pm:globaleditmodetoggled');
        Map.removeEventListener('pm:drawstart')
        Map.removeEventListener('pm:remove');
      }
    }
  }, [Map, previewLayer]);
  // Map Handlers End

  return (
    <Flex
      h={'100vh'}
      w={'100vw'}
      flex={1}
      flexDirection={'row'}
    >
      <Flex flex={0.8}>
        <Mapview
          onEditorReady={setMap}
        />
      </Flex>

      <Flex flex={0.2} shadow={'xl'} bg={'gray.700'} overflowY={'scroll'}>
        <Box>
          <VStack p={2} color={'white'} gap={6}>
            <Text fontSize={'2xl'} fontWeight={'bold'}>Map Tiles Downloader</Text>
            <Box borderWidth={1} borderColor={'white'} rounded={'md'} p={4} w={'100%'}>
              <Text fontSize={'xl'} fontWeight={'bold'} mb={2}>1. Select Region</Text>
              <FormControl as={Flex} justifyContent={'center'}>
                <Button
                  onClick={() => {
                    Map?.pm.enableDraw('Polygon')
                  }}
                  colorScheme={'orange'} size={'md'} w={'100%'}>Draw Region</Button>
              </FormControl>

              <Text color={'white'} textAlign={'center'} my={2}>OR</Text>

              <FormControl color={'white'}>
                <Box
                  borderWidth={1}
                  borderColor={'orange.500'}
                  rounded={'md'}
                  borderStyle={'dashed'}
                  p={4}
                  color={'orange.500'}
                  textAlign={'center'}
                  fontWeight={'semibold'}
                >
                  <div {...getRootProps()}>
                    <input {...getInputProps()} />
                    <Text fontSize={'md'} my={5}>
                      Select Geojson file
                    </Text>
                    <Text fontSize={'sm'} color={'red.500'}>
                      extension must be .geojson
                    </Text>
                    <Text fontSize={'md'} color={'red.500'}>
                      Only Support Polygon or Multi-Polygon
                    </Text>
                  </div>
                </Box>
              </FormControl>
            </Box>

            <Box borderWidth={1} borderColor={'white'} rounded={'md'} p={4} w={'100%'}>
              <Text fontSize={'xl'} fontWeight={'bold'} mb={2}>2. Configure</Text>
              <VStack gap={4}>
                <FormControl>
                  <FormLabel>Map Tile Source</FormLabel>
                  <Select
                    defaultValue={mapSource}
                    onChange={(event) => {
                      setMapSource(event.target.value)
                    }}
                  >
                    {MapSource.map(({ name, options }) => {
                      return (
                        <optgroup label={name} key={`source-name-${name}`}>
                          {Object.entries(options).map(option => (
                            <option
                              key={`source-option-${option[0]}`}
                              value={option[1]}
                            >
                              {option[0]}
                            </option>
                          ))}
                        </optgroup>
                      )
                    })}
                  </Select>
                </FormControl>


                <HStack>
                  <FormControl>
                    <FormLabel>Zoom From</FormLabel>
                    <NumberInput
                      min={1}
                      max={maxZoom}
                      value={Number(fromZoom)}
                      onChange={(valueString) => setFromZoom(Number(valueString))}
                    >
                      <NumberInputField/>
                      <NumberInputStepper>
                        <NumberIncrementStepper color={'white'}/>
                        <NumberDecrementStepper color={'white'}/>
                      </NumberInputStepper>
                    </NumberInput>
                  </FormControl>

                  <FormControl>
                    <FormLabel>Zoom To</FormLabel>
                    <NumberInput
                      min={1}
                      max={maxZoom}
                      value={Number(toZoom)}
                      onChange={(valueString) => setToZoom(Number(valueString))}
                    >
                      <NumberInputField/>
                      <NumberInputStepper>
                        <NumberIncrementStepper color={'white'}/>
                        <NumberDecrementStepper color={'white'}/>
                      </NumberInputStepper>
                    </NumberInput>
                  </FormControl>
                </HStack>

                {totalTileLength && (
                  <Text fontWeight={'bold'}>Total Tiles: {totalTileLength.toLocaleString('id-ID')}</Text>
                )}

                <Button
                  mt={2}
                  colorScheme={'orange'}
                  onClick={previewHandler}
                  isLoading={isPreviewLoading}
                  loadingText={'Processing'}
                >Preview Grid</Button>
              </VStack>
            </Box>

            <Accordion allowMultiple w={'100%'}>
              <AccordionItem borderWidth={1} borderColor={'white'} rounded={'md'}>
                <h2>
                  <AccordionButton>
                    <Box flex="1" textAlign="left">
                      <Text fontSize={'xl'} fontWeight={'bold'}>
                        3. More Options
                      </Text>
                    </Box>
                    <AccordionIcon/>
                  </AccordionButton>
                </h2>
                <AccordionPanel pb={4}>
                  <VStack gap={4}>
                    <FormControl>
                      <FormLabel>Output Scale</FormLabel>
                      <Select
                        onChange={(event) => {
                          setOutputScale(Number(event.target.value))
                        }}
                        defaultValue={outputScale}
                      >
                        <option value={1}>1x</option>
                        <option value={2}>2x</option>
                      </Select>
                    </FormControl>

                    <FormControl>
                      <FormLabel>Output Directory</FormLabel>
                      <Input
                        placeholder={'{timestamp}'}
                        value={outputDirectory}
                        onChange={(event) => {
                          setOutputDirectory(event.target.value)
                        }}
                      />
                    </FormControl>

                    <FormControl>
                      <FormLabel>Output Type</FormLabel>
                      <Select
                        defaultValue={outputType}
                        onChange={(event) => {
                          setOutputType(event.target.value)
                        }}
                      >
                        <option value={'directory'}>Directory</option>
                        <option value={'mbtiles'}>Mbtiles</option>
                        <option value={'repo'}>Repo</option>
                      </Select>
                    </FormControl>

                    <FormControl>
                      <FormLabel>Paralell Downloads</FormLabel>
                      <NumberInput
                        min={1}
                        value={Number(paralellDownload)}

                        onChange={(valueString) => setParalellDownload(Number(valueString))}
                      >
                        <NumberInputField/>
                        <NumberInputStepper>
                          <NumberIncrementStepper color={'white'}/>
                          <NumberDecrementStepper color={'white'}/>
                        </NumberInputStepper>
                      </NumberInput>
                    </FormControl>
                  </VStack>
                </AccordionPanel>
              </AccordionItem>
            </Accordion>

            <Button
              size={'lg'}
              colorScheme={'orange'}
              onClick={() => {
              }}
            >
              Download
            </Button>
          </VStack>
        </Box>
      </Flex>
    </Flex>
  )
}
