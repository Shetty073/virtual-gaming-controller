import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/models/controller_models.dart';
import '../../core/network/udp_client.dart';
import '../widgets/steering_wheel.dart';
import '../widgets/pedal_slider.dart';
import '../widgets/game_button.dart';

enum CockpitLayout {
  splitSides,   // Steering Left, Buttons Center, Pedals Right
  pedalsLeft,   // Pedals Left, Steering Center, Buttons Right
  buttonsTop,   // Buttons Top, Wheel Left, Pedals Right
}

class ControllerScreen extends StatefulWidget {
  final String host;
  final int port;
  final GameProfile profile;

  const ControllerScreen({
    super.key,
    required this.host,
    required this.port,
    required this.profile,
  });

  @override
  State<ControllerScreen> createState() => _ControllerScreenState();
}

class _ControllerScreenState extends State<ControllerScreen> {
  final UdpControllerClient _client = UdpControllerClient();
  Timer? _streamTimer;

  int _selectedDegrees = 900;
  double _wheelSize = 200.0; // Dynamic resizable wheel (150px - 260px)
  CockpitLayout _currentLayout = CockpitLayout.splitSides;
  bool _isEditingLayout = false;

  late List<ControlButton> _activeButtons;
  late List<ControlButton> _presetPool; // All preset buttons in profile to allow re-adding!

  double _steer = 0.0;
  double _throttle = 0.0;
  double _brake = 0.0;
  final List<String> _pendingDown = [];
  final List<String> _pendingUp = [];

  // Realistic vehicle state
  bool _isEngineOn = false;
  bool _isHazardOn = false;
  bool _isLeftBlinkerOn = false;
  bool _isRightBlinkerOn = false;

  @override
  void initState() {
    super.initState();
    _presetPool = List.from(widget.profile.buttons);
    _activeButtons = List.from(widget.profile.buttons);

    SystemChrome.setPreferredOrientations([
      DeviceOrientation.landscapeLeft,
      DeviceOrientation.landscapeRight,
    ]);

    _client.connect(widget.host, widget.port);

    // Stream controller state at ~50Hz (20ms interval) with zero memory allocations
    _streamTimer = Timer.periodic(const Duration(milliseconds: 20), (_) {
      _client.sendInput(
        steer: _steer,
        throttle: _throttle,
        brake: _brake,
        buttonsDown: _pendingDown,
        buttonsUp: _pendingUp,
      );
      if (_pendingDown.isNotEmpty) _pendingDown.clear();
      if (_pendingUp.isNotEmpty) _pendingUp.clear();
    });
  }

  @override
  void dispose() {
    _streamTimer?.cancel();
    _client.disconnect();
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.portraitUp,
      DeviceOrientation.landscapeLeft,
      DeviceOrientation.landscapeRight,
    ]);
    super.dispose();
  }

  // --- Realistic Automotive Simulation Button Handler ---
  void _handleButtonPressed(ControlButton btn) {
    HapticFeedback.lightImpact();

    setState(() {
      if (btn.id == 'btn_engine') {
        _isEngineOn = !_isEngineOn;
        btn.isToggled = _isEngineOn;
        // If engine turns off, turn off directional blinkers (hazards remain operable)
        if (!_isEngineOn) {
          _isLeftBlinkerOn = false;
          _isRightBlinkerOn = false;
          for (var b in _activeButtons) {
            if (b.id == 'btn_blinker_l' || b.id == 'btn_blinker_r') {
              b.isToggled = false;
            }
          }
        }
      } else if (btn.id == 'btn_hazard') {
        // Hazard works regardless of engine ignition
        _isHazardOn = !_isHazardOn;
        btn.isToggled = _isHazardOn;
      } else if (btn.id == 'btn_blinker_l') {
        // Left turn indicator: Cancels right indicator
        if (_isEngineOn) {
          _isLeftBlinkerOn = !_isLeftBlinkerOn;
          btn.isToggled = _isLeftBlinkerOn;
          if (_isLeftBlinkerOn) {
            _isRightBlinkerOn = false;
            for (var b in _activeButtons) {
              if (b.id == 'btn_blinker_r') b.isToggled = false;
            }
          }
        }
      } else if (btn.id == 'btn_blinker_r') {
        // Right turn indicator: Cancels left indicator
        if (_isEngineOn) {
          _isRightBlinkerOn = !_isRightBlinkerOn;
          btn.isToggled = _isRightBlinkerOn;
          if (_isRightBlinkerOn) {
            _isLeftBlinkerOn = false;
            for (var b in _activeButtons) {
              if (b.id == 'btn_blinker_l') b.isToggled = false;
            }
          }
        }
      } else if (btn.type == 'multi_stage') {
        // 3-Stage cycle: Off (0) -> White (1) -> Amber (2) -> Green (3) -> Off (0)
        btn.stage = (btn.stage + 1) % (btn.maxStages + 1);
      } else if (btn.type == 'toggle') {
        btn.isToggled = !btn.isToggled;
      } else {
        btn.isPressed = true;
      }

      _pendingDown.add(btn.id);
    });
  }

  void _handleButtonReleased(ControlButton btn) {
    if (btn.type == 'momentary') {
      setState(() {
        btn.isPressed = false;
        _pendingUp.add(btn.id);
      });
    }
  }

  // --- Wheel Resize & Degrees Dialog ---
  void _showWheelSettingsDialog() {
    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setModalState) => AlertDialog(
          backgroundColor: const Color(0xFF0F172A),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: const Text('STEERING WHEEL TUNING', style: TextStyle(color: Color(0xFF00F0FF), fontSize: 13, fontWeight: FontWeight.bold)),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('WHEEL SIZE / SCALE', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11, fontWeight: FontWeight.bold)),
                const SizedBox(height: 6),
                Row(
                  children: [
                    const Icon(Icons.photo_size_select_small, color: Color(0xFF00F0FF), size: 18),
                    Expanded(
                      child: Slider(
                        min: 150.0,
                        max: 250.0,
                        divisions: 10,
                        value: _wheelSize,
                        activeColor: const Color(0xFF00F0FF),
                        onChanged: (v) {
                          setModalState(() => _wheelSize = v);
                          setState(() => _wheelSize = v);
                        },
                      ),
                    ),
                    Text('${_wheelSize.toInt()}px', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                  ],
                ),
                const Divider(color: Color(0xFF334155), height: 20),
                const Text('DEGREES OF ROTATION', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11, fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [180, 270, 360, 540, 900, 1080].map((deg) {
                    final isSelected = _selectedDegrees == deg;
                    return ChoiceChip(
                      label: Text('$deg°', style: TextStyle(color: isSelected ? Colors.black : Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                      selected: isSelected,
                      selectedColor: const Color(0xFF00F0FF),
                      backgroundColor: const Color(0xFF1E293B),
                      onSelected: (selected) {
                        if (selected) {
                          setModalState(() => _selectedDegrees = deg);
                          setState(() => _selectedDegrees = deg);
                        }
                      },
                    );
                  }).toList(),
                ),
              ],
            ),
          ),
          actions: [
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF00F0FF), foregroundColor: Colors.black),
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('DONE', style: TextStyle(fontWeight: FontWeight.bold)),
            )
          ],
        ),
      ),
    );
  }

  // --- Layout Selector Dialog ---
  void _showLayoutSelectorDialog() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF0F172A),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('SELECT COCKPIT LAYOUT', style: TextStyle(color: Color(0xFF00F0FF), fontSize: 13, fontWeight: FontWeight.bold)),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                dense: true,
                leading: const Icon(Icons.view_column, color: Color(0xFF00F0FF)),
                title: const Text('Split Sides (Wheel Left, Pedals Right)', style: TextStyle(color: Colors.white, fontSize: 12)),
                subtitle: const Text('Buttons in Center Grid', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 10)),
                selected: _currentLayout == CockpitLayout.splitSides,
                onTap: () {
                  setState(() => _currentLayout = CockpitLayout.splitSides);
                  Navigator.of(ctx).pop();
                },
              ),
              ListTile(
                dense: true,
                leading: const Icon(Icons.view_array, color: Color(0xFF00FF66)),
                title: const Text('Pedals Left, Wheel Center', style: TextStyle(color: Colors.white, fontSize: 12)),
                subtitle: const Text('Buttons on Right', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 10)),
                selected: _currentLayout == CockpitLayout.pedalsLeft,
                onTap: () {
                  setState(() => _currentLayout = CockpitLayout.pedalsLeft);
                  Navigator.of(ctx).pop();
                },
              ),
              ListTile(
                dense: true,
                leading: const Icon(Icons.view_stream, color: Color(0xFFFF0055)),
                title: const Text('Top Button Matrix', style: TextStyle(color: Colors.white, fontSize: 12)),
                subtitle: const Text('Wheel Left, Pedals Right Below', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 10)),
                selected: _currentLayout == CockpitLayout.buttonsTop,
                onTap: () {
                  setState(() => _currentLayout = CockpitLayout.buttonsTop);
                  Navigator.of(ctx).pop();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  // --- Add / Re-Add Buttons Dialog ---
  void _showAddButtonDialog() {
    // Collect keys that are already in use
    final usedKeys = _activeButtons.map((b) => b.key.toUpperCase()).toSet();
    final activeIds = _activeButtons.map((b) => b.id).toSet();
    final removedPresets = _presetPool.where((b) => !activeIds.contains(b.id)).toList();

    final labelCtrl = TextEditingController();
    final keyCtrl = TextEditingController();
    String buttonType = 'momentary';
    String? validationError;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          backgroundColor: const Color(0xFF0F172A),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: const Text('BUTTON CONFIGURATOR', style: TextStyle(color: Color(0xFF00F0FF), fontSize: 13, fontWeight: FontWeight.bold)),
          content: SizedBox(
            width: 360,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Re-Add Removed Preset Buttons Section
                  if (removedPresets.isNotEmpty) ...[
                    const Text('RE-ADD PRESET BUTTONS', style: TextStyle(color: Color(0xFF00FF66), fontSize: 11, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: removedPresets.map((preset) {
                        return ActionChip(
                          avatar: const Icon(Icons.add, size: 14, color: Colors.black),
                          backgroundColor: const Color(0xFF00FF66),
                          label: Text('${preset.label} [${preset.key}]', style: const TextStyle(color: Colors.black, fontWeight: FontWeight.bold, fontSize: 10)),
                          onPressed: () {
                            setState(() {
                              _activeButtons.add(preset);
                            });
                            Navigator.of(ctx).pop();
                          },
                        );
                      }).toList(),
                    ),
                    const Divider(color: Color(0xFF334155), height: 20),
                  ],

                  // Create Custom Non-Preset Button
                  const Text('CREATE CUSTOM BUTTON', style: TextStyle(color: Color(0xFF00F0FF), fontSize: 11, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  TextField(
                    controller: labelCtrl,
                    style: const TextStyle(color: Colors.white, fontSize: 12),
                    decoration: const InputDecoration(
                      labelText: 'Button Label (e.g. BEACON, WIPER+)',
                      labelStyle: TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
                      isDense: true,
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: keyCtrl,
                    style: const TextStyle(color: Colors.white, fontSize: 12),
                    decoration: InputDecoration(
                      labelText: 'Keyboard Key (e.g. O, B, X, Y)',
                      labelStyle: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
                      errorText: validationError,
                      isDense: true,
                    ),
                    onChanged: (val) {
                      final keyUpper = val.trim().toUpperCase();
                      if (usedKeys.contains(keyUpper)) {
                        setDialogState(() {
                          validationError = 'Key [$keyUpper] is already assigned!';
                        });
                      } else {
                        setDialogState(() {
                          validationError = null;
                        });
                      }
                    },
                  ),
                  const SizedBox(height: 10),
                  const Text('SWITCH BEHAVIOR', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 10)),
                  DropdownButton<String>(
                    value: buttonType,
                    dropdownColor: const Color(0xFF0F172A),
                    isExpanded: true,
                    items: const [
                      DropdownMenuItem(value: 'momentary', child: Text('Momentary (Push & Release)', style: TextStyle(color: Colors.white, fontSize: 11))),
                      DropdownMenuItem(value: 'toggle', child: Text('Toggle Switch (On / Off)', style: TextStyle(color: Colors.white, fontSize: 11))),
                      DropdownMenuItem(value: 'multi_stage', child: Text('3-Stage Switch (Off -> White -> Amber -> Green)', style: TextStyle(color: Color(0xFF00FF66), fontSize: 11))),
                    ],
                    onChanged: (v) {
                      if (v != null) setDialogState(() => buttonType = v);
                    },
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('CANCEL', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF00F0FF), foregroundColor: Colors.black),
              onPressed: () {
                final label = labelCtrl.text.trim();
                final key = keyCtrl.text.trim().toUpperCase();

                if (label.isEmpty || key.isEmpty) return;

                if (usedKeys.contains(key)) {
                  setDialogState(() {
                    validationError = 'Key [$key] already in use!';
                  });
                  return;
                }

                setState(() {
                  _activeButtons.add(ControlButton(
                    id: 'custom_${DateTime.now().millisecondsSinceEpoch}',
                    label: label.toUpperCase(),
                    key: key,
                    type: buttonType,
                    icon: buttonType == 'multi_stage' ? 'light_mode' : 'touch_app',
                    maxStages: 3,
                  ));
                });
                Navigator.of(ctx).pop();
              },
              child: const Text('ADD BUTTON', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 11)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPedals() {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        PedalSlider(
          label: 'BRAKE',
          value: _brake,
          onChanged: (v) => setState(() => _brake = v),
          activeColor: const Color(0xFFFF0055),
          icon: Icons.rotate_left_rounded,
        ),
        const SizedBox(width: 8),
        PedalSlider(
          label: 'GAS',
          value: _throttle,
          onChanged: (v) => setState(() => _throttle = v),
          activeColor: const Color(0xFF00FF66),
          icon: Icons.bolt_rounded,
        ),
      ],
    );
  }

  Widget _buildSteeringWheel() {
    final isFernbus = widget.profile.id.contains('fernbus');
    return SteeringWheel(
      currentAngle: _steer,
      size: _wheelSize,
      degreesOfRotation: _selectedDegrees,
      isBusDesign: isFernbus,
      onAngleChanged: (angle) {
        setState(() {
          _steer = angle;
        });
      },
    );
  }

  Widget _buildButtonsMatrix({int crossAxisCount = 4}) {
    return Container(
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(
        color: const Color(0xFF0B1120),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _isEditingLayout ? const Color(0xFF00F0FF) : const Color(0xFF1E293B)),
      ),
      child: ReorderableGridView(
        isEditing: _isEditingLayout,
        buttons: _activeButtons,
        crossAxisCount: crossAxisCount,
        onReorder: (oldIndex, newIndex) {
          setState(() {
            if (newIndex > oldIndex) newIndex -= 1;
            final item = _activeButtons.removeAt(oldIndex);
            _activeButtons.insert(newIndex, item);
          });
        },
        onDelete: (index) {
          setState(() {
            _activeButtons.removeAt(index);
          });
        },
        onPressed: _handleButtonPressed,
        onReleased: _handleButtonReleased,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF030712),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10.0, vertical: 4.0),
          child: Column(
            children: [
              // Top HUD Status & Controls
              SizedBox(
                height: 36,
                child: Row(
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        color: Color(0xFF00FF66),
                        boxShadow: [BoxShadow(color: Color(0xFF00FF66), blurRadius: 6)],
                      ),
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        'CONNECTED TO ${widget.host}  •  ${widget.profile.name.toUpperCase()}',
                        style: const TextStyle(
                          color: Color(0xFF94A3B8),
                          fontSize: 9.5,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 1,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),

                    // Layout Editor Mode Toggle
                    IconButton(
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
                      tooltip: 'Edit / Reorganize Buttons',
                      icon: Icon(
                        _isEditingLayout ? Icons.check_circle : Icons.tune_rounded,
                        color: _isEditingLayout ? const Color(0xFF00FF66) : const Color(0xFF00F0FF),
                        size: 18,
                      ),
                      onPressed: () => setState(() => _isEditingLayout = !_isEditingLayout),
                    ),

                    if (_isEditingLayout)
                      IconButton(
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
                        tooltip: 'Add / Re-Add Buttons',
                        icon: const Icon(Icons.add_circle_outline, color: Color(0xFF00FF66), size: 18),
                        onPressed: _showAddButtonDialog,
                      ),

                    // Cockpit Layout Switcher
                    IconButton(
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
                      tooltip: 'Switch Cockpit Layout',
                      icon: const Icon(Icons.dashboard_customize_rounded, color: Color(0xFF38BDF8), size: 18),
                      onPressed: _showLayoutSelectorDialog,
                    ),

                    // Steering Wheel Size & Degrees
                    IconButton(
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
                      tooltip: 'Steering Wheel Size & Degrees',
                      icon: const Icon(Icons.settings_suggest_rounded, color: Color(0xFF00F0FF), size: 18),
                      onPressed: _showWheelSettingsDialog,
                    ),

                    const SizedBox(width: 4),

                    IconButton(
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
                      icon: const Icon(Icons.close, color: Colors.white70, size: 18),
                      onPressed: () => Navigator.of(context).pop(),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 4),

              // Cockpit Area
              Expanded(
                child: Builder(
                  builder: (context) {
                    if (_currentLayout == CockpitLayout.splitSides) {
                      // Steering Left | Buttons Center | Pedals Right
                      return Row(
                        children: [
                          _buildSteeringWheel(),
                          const SizedBox(width: 8),
                          Expanded(child: _buildButtonsMatrix(crossAxisCount: 4)),
                          const SizedBox(width: 8),
                          _buildPedals(),
                        ],
                      );
                    } else if (_currentLayout == CockpitLayout.buttonsTop) {
                      // Buttons Top Row | Wheel Left | Pedals Right Below
                      return Column(
                        children: [
                          Expanded(
                            flex: 3,
                            child: _buildButtonsMatrix(crossAxisCount: 7),
                          ),
                          const SizedBox(height: 6),
                          Expanded(
                            flex: 5,
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceAround,
                              children: [
                                _buildSteeringWheel(),
                                _buildPedals(),
                              ],
                            ),
                          ),
                        ],
                      );
                    } else {
                      // Pedals Left | Wheel Center | Buttons Right
                      return Row(
                        children: [
                          _buildPedals(),
                          const SizedBox(width: 8),
                          Expanded(
                            flex: 4,
                            child: Center(child: _buildSteeringWheel()),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            flex: 5,
                            child: _buildButtonsMatrix(crossAxisCount: 4),
                          ),
                        ],
                      );
                    }
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class ReorderableGridView extends StatelessWidget {
  final bool isEditing;
  final List<ControlButton> buttons;
  final int crossAxisCount;
  final Function(int oldIndex, int newIndex) onReorder;
  final Function(int index) onDelete;
  final Function(ControlButton) onPressed;
  final Function(ControlButton) onReleased;

  const ReorderableGridView({
    super.key,
    required this.isEditing,
    required this.buttons,
    required this.crossAxisCount,
    required this.onReorder,
    required this.onDelete,
    required this.onPressed,
    required this.onReleased,
  });

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      physics: const BouncingScrollPhysics(),
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: crossAxisCount,
        crossAxisSpacing: 5,
        mainAxisSpacing: 5,
        childAspectRatio: 1.15,
      ),
      itemCount: buttons.length,
      itemBuilder: (context, index) {
        final btn = buttons[index];
        return Stack(
          children: [
            Positioned.fill(
              child: GameControlButton(
                button: btn,
                onPressed: () => onPressed(btn),
                onReleased: () => onReleased(btn),
              ),
            ),
            if (isEditing)
              Positioned(
                top: 0,
                right: 0,
                child: GestureDetector(
                  onTap: () => onDelete(index),
                  child: Container(
                    padding: const EdgeInsets.all(3),
                    decoration: const BoxDecoration(
                      color: Color(0xFFFF0055),
                      shape: BoxShape.circle,
                      boxShadow: [BoxShadow(color: Color(0xFFFF0055), blurRadius: 4)],
                    ),
                    child: const Icon(Icons.close, size: 10, color: Colors.white),
                  ),
                ),
              )
          ],
        );
      },
    );
  }
}
