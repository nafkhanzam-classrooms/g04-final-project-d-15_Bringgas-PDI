package protocol

import (
	"encoding/binary"
	"errors"
	"fmt"
	"hash/crc32"
)

// Magic Number & Version
const (
	MagicNumber = 0xCAFE
	Version     = 0x01
)

// Message Type Codes
const (
	MsgCreateClass     uint16 = 0x0001
	MsgJoinClass       uint16 = 0x0002
	MsgClassState      uint16 = 0x0003
	MsgSendQuestion    uint16 = 0x0010
	MsgSubmitAnswer    uint16 = 0x0011
	MsgQuizResult      uint16 = 0x0012
	MsgSlideChange     uint16 = 0x0020
	MsgSlideBroadcast  uint16 = 0x0021
	MsgLeaderboard     uint16 = 0x0030
	MsgToggleVideoCall uint16 = 0x0040
	MsgHeartbeat       uint16 = 0x00F0
	MsgError           uint16 = 0x00FF
	MsgReplicateState  uint16 = 0x0100
)

var (
	ErrInvalidMagic    = errors.New("invalid magic number")
	ErrInvalidVersion  = errors.New("unsupported protocol version")
	ErrPacketTooShort  = errors.New("packet is too short to contain header")
	ErrChecksumFailed  = errors.New("checksum verification failed")
	ErrPayloadMismatch = errors.New("payload length does not match header length")
)

// Packet Header Size: Magic(2B) + Version(1B) + MsgType(2B) + SeqNum(4B) + Length(4B) = 13 Bytes
// + Checksum(4B) at the end of the packet.
// Total non-payload overhead = 17 Bytes
const HeaderSize = 13
const ChecksumSize = 4

// EncodePacket packages the payload into a custom binary packet frame.
func EncodePacket(msgType uint16, seq uint32, payload []byte) []byte {
	payloadLen := uint32(len(payload))
	packet := make([]byte, HeaderSize+payloadLen+ChecksumSize)

	// Write Header
	binary.BigEndian.PutUint16(packet[0:2], MagicNumber)
	packet[2] = Version
	binary.BigEndian.PutUint16(packet[3:5], msgType)
	binary.BigEndian.PutUint32(packet[5:9], seq)
	binary.BigEndian.PutUint32(packet[9:13], payloadLen)

	// Write Payload
	copy(packet[HeaderSize:HeaderSize+payloadLen], payload)

	// Calculate CRC32 of payload
	checksum := crc32.ChecksumIEEE(payload)
	binary.BigEndian.PutUint32(packet[HeaderSize+payloadLen:HeaderSize+payloadLen+ChecksumSize], checksum)

	return packet
}

// DecodePacket decodes a raw binary packet, verifying magic number, version, and checksum.
func DecodePacket(data []byte) (uint16, uint32, []byte, error) {
	if len(data) < HeaderSize+ChecksumSize {
		return 0, 0, nil, ErrPacketTooShort
	}

	// 1. Verify Magic Number
	magic := binary.BigEndian.Uint16(data[0:2])
	if magic != MagicNumber {
		return 0, 0, nil, fmt.Errorf("%w: received 0x%04X", ErrInvalidMagic, magic)
	}

	// 2. Verify Version
	version := data[2]
	if version != Version {
		return 0, 0, nil, fmt.Errorf("%w: received 0x%02X", ErrInvalidVersion, version)
	}

	// 3. Extract Message Type and Seq Number
	msgType := binary.BigEndian.Uint16(data[3:5])
	seq := binary.BigEndian.Uint32(data[5:9])

	// 4. Verify Payload Length
	payloadLen := binary.BigEndian.Uint32(data[9:13])
	totalExpectedLen := HeaderSize + payloadLen + ChecksumSize
	if uint32(len(data)) < totalExpectedLen {
		return 0, 0, nil, ErrPayloadMismatch
	}

	// 5. Extract Payload & Checksum
	payload := data[HeaderSize : HeaderSize+payloadLen]
	checksum := binary.BigEndian.Uint32(data[HeaderSize+payloadLen : HeaderSize+payloadLen+ChecksumSize])

	// 6. Verify Checksum
	expectedChecksum := crc32.ChecksumIEEE(payload)
	if checksum != expectedChecksum {
		return 0, 0, nil, ErrChecksumFailed
	}

	return msgType, seq, payload, nil
}
